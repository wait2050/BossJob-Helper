// ===== Boss海投助手 Cloudflare Worker 后端 =====

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

// 新用户免费试用额度（可投递 10 个岗位）
const FREE_CREDITS = 10;
// 新用户判定窗口：账号创建后 24h 内才算新用户（用于邀请奖励发放）
const NEW_USER_WINDOW = 24 * 60 * 60 * 1000;

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 邀请链接重定向：/r?from=usr_xxx → BOSS直聘 + 带 invite 参数
      if (path === '/r' && request.method === 'GET') {
        const from = url.searchParams.get('from');
        if (!from) return new Response('Missing from', { status: 400 });
        const target = 'https://www.zhipin.com/web/geek/job-recommend?invite=' + encodeURIComponent(from);
        return new Response(null, {
          status: 302,
          headers: { 'Location': target, 'Cache-Control': 'no-store' }
        });
      }
      if (path === '/api/credits' && request.method === 'GET') {
        return await handleQueryCredits(url, env);
      }
      if (path === '/api/recharge' && request.method === 'POST') {
        return await handleRecharge(request, env);
      }
      if (path === '/api/chat' && request.method === 'POST') {
        return await handleChat(request, env);
      }
      if (path === '/api/deduct' && request.method === 'POST') {
        return await handleDeduct(request, env);
      }
      if (path === '/api/invite' && request.method === 'POST') {
        return await handleInvite(request, env);
      }
      if (path === '/api/auth/send-code' && request.method === 'POST') {
        return await handleSendCode(request, env);
      }
      if (path === '/api/auth/login' && request.method === 'POST') {
        return await handleLogin(request, env);
      }
      if (path === '/api/auth/check' && request.method === 'POST') {
        return await handleCheckSession(request, env);
      }
      return jsonResponse({ error: 'Not Found' }, 404);
    } catch (e) {
      return jsonResponse({ error: e.message || 'Internal Error' }, 500);
    }
  }
};

// ── 获取或初始化用户数据 ──
async function getOrCreateUser(env, clientId) {
  let userData = await env.BOSS_KV.get('user:' + clientId, 'json');
  if (!userData) {
    userData = { credits: FREE_CREDITS, total_delivered: 0, created: Date.now(), invited_by: null, invite_count: 0 };
    await env.BOSS_KV.put('user:' + clientId, JSON.stringify(userData));
  }
  return userData;
}

// ── 查询余额 ──
async function handleQueryCredits(url, env) {
  const clientId = url.searchParams.get('client_id');
  if (!clientId) return jsonResponse({ error: '缺少 client_id' }, 400);

  const userData = await getOrCreateUser(env, clientId);
  return jsonResponse({
    credits: userData.credits,
    total_delivered: userData.total_delivered || 0,
    invited_by: userData.invited_by || null,
    invite_count: userData.invite_count || 0
  });
}

// ── 卡密充值 ──
async function handleRecharge(request, env) {
  const body = await request.json();
  const { client_id, code } = body;
  if (!client_id || !code) return jsonResponse({ error: '缺少参数' }, 400);

  // 1. 查询卡密
  const cardKey = 'card:' + code.trim();
  const cardData = await env.BOSS_KV.get(cardKey, 'json');
  if (!cardData) return jsonResponse({ error: '无效的充值码' }, 400);
  if (cardData.used) return jsonResponse({ error: '该充值码已被使用' }, 400);

  // 2. 标记卡密已使用
  cardData.used = true;
  cardData.used_by = client_id;
  cardData.used_at = Date.now();
  await env.BOSS_KV.put(cardKey, JSON.stringify(cardData));

  // 3. 给用户加额度
  const userData = await getOrCreateUser(env, client_id);
  userData.credits += cardData.credits;
  await env.BOSS_KV.put('user:' + client_id, JSON.stringify(userData));

  return jsonResponse({
    success: true,
    message: '充值成功！已增加 ' + cardData.credits + ' 个岗位投递额度',
    credits: userData.credits
  });
}

// ── AI 代理请求（只检查余额，不扣费）──
async function handleChat(request, env) {
  const body = await request.json();
  const { client_id, messages, max_tokens, temperature } = body;
  if (!client_id) return jsonResponse({ error: '缺少 client_id' }, 400);
  if (!messages || !messages.length) return jsonResponse({ error: '缺少 messages' }, 400);

  // 1. 检查余额（仅检查，不扣减。扣减在投递成功后由 /api/deduct 完成）
  const userData = await getOrCreateUser(env, client_id);
  if (userData.credits <= 0) {
    return jsonResponse({
      error: '余额不足，请充值后再使用。当前可投递岗位数：0',
      credits: 0,
      need_recharge: true
    }, 403);
  }

  // 2. 向 AI 服务商发起请求
  const aiResp = await fetch(env.AI_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + env.AI_API_KEY
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
      messages,
      max_tokens: max_tokens || 500,
      temperature: temperature || 0.5
    })
  });

  if (!aiResp.ok) {
    const errText = await aiResp.text().catch(() => '');
    return jsonResponse({ error: 'AI 服务异常: ' + aiResp.status + ' ' + errText.slice(0, 200) }, 502);
  }

  const aiData = await aiResp.json();
  if (aiData.error) {
    return jsonResponse({ error: 'AI 返回错误: ' + (aiData.error.message || JSON.stringify(aiData.error)) }, 502);
  }

  // 3. 返回 AI 响应 + 当前余额（不扣减）
  // 兼容推理模型（如 deepseek-v4-flash）：content 为空时用 reasoning_content 兜底
  if (aiData.choices && aiData.choices[0] && aiData.choices[0].message) {
    const msg = aiData.choices[0].message;
    if (!msg.content && msg.reasoning_content) {
      msg.content = msg.reasoning_content;
    }
  }
  return jsonResponse({
    choices: aiData.choices,
    usage: aiData.usage,
    credits_remaining: userData.credits
  });
}

// ── 投递成功后扣费（每成功投递 1 个岗位扣 1 点）──
async function handleDeduct(request, env) {
  const body = await request.json();
  const { client_id } = body;
  if (!client_id) return jsonResponse({ error: '缺少 client_id' }, 400);

  const userData = await getOrCreateUser(env, client_id);
  if (userData.credits <= 0) {
    return jsonResponse({ error: '余额不足', credits: 0, need_recharge: true }, 403);
  }

  userData.credits -= 1;
  userData.total_delivered = (userData.total_delivered || 0) + 1;
  await env.BOSS_KV.put('user:' + client_id, JSON.stringify(userData));

  return jsonResponse({
    success: true,
    credits: userData.credits,
    total_delivered: userData.total_delivered
  });
}

// ── 邀请好友（双方各 +10，仅新用户可领）──
// 改造点：必须登录（带 token），且被邀请人必须是新用户（账号创建 24h 内）才发奖励
async function handleInvite(request, env) {
  const body = await request.json();
  const { token, invite_code } = body;
  if (!token || !invite_code) return jsonResponse({ error: '缺少参数' }, 400);

  // 1. 鉴权：token → session
  const session = await env.BOSS_KV.get('session:' + token, 'json');
  if (!session || Date.now() > session.expires) {
    return jsonResponse({ error: '登录已失效，请重新登录后再填邀请码' }, 401);
  }
  const clientId = session.client_id;
  if (clientId === invite_code) return jsonResponse({ error: '不能邀请自己' }, 400);

  // 2. 邀请人必须存在
  const inviter = await env.BOSS_KV.get('user:' + invite_code, 'json');
  if (!inviter) return jsonResponse({ error: '邀请码无效' }, 400);

  // 3. 当前用户必须未填过邀请码
  const userData = await getOrCreateUser(env, clientId);
  if (userData.invited_by) return jsonResponse({ error: '你已填写过邀请码，每个用户只能填写一次' }, 400);

  // 4. 关键校验：被邀请人必须是新用户（账号创建 24h 内）
  //    通过 account:{email} 拿到 created 时间；老用户直接拒绝
  const account = await env.BOSS_KV.get('account:' + session.email, 'json');
  if (!account || !account.created || Date.now() - account.created > NEW_USER_WINDOW) {
    return jsonResponse({ error: '邀请码仅限新用户使用（注册 24 小时内有效）' }, 403);
  }

  // 5. 双方各 +10
  userData.credits += FREE_CREDITS;
  userData.invited_by = invite_code;
  await env.BOSS_KV.put('user:' + clientId, JSON.stringify(userData));

  inviter.credits = (inviter.credits || 0) + FREE_CREDITS;
  inviter.invite_count = (inviter.invite_count || 0) + 1;
  await env.BOSS_KV.put('user:' + invite_code, JSON.stringify(inviter));

  return jsonResponse({
    success: true,
    message: '邀请成功！你和好友各获得 ' + FREE_CREDITS + ' 个免费投递额度',
    credits: userData.credits,
    inviter_credits: inviter.credits
  });
}

// ── 发送登录验证码 ──
async function handleSendCode(request, env) {
  const body = await request.json();
  const { email } = body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return jsonResponse({ error: '邮箱格式不正确' }, 400);
  }

  const emailKey = email.toLowerCase().trim();

  // 防滥用：60 秒内不能重复发（验证码 5 分钟过期，剩 4 分钟以上说明刚发过）
  const existing = await env.BOSS_KV.get('code:' + emailKey, 'json');
  if (existing && existing.expires - Date.now() > 4 * 60 * 1000) {
    return jsonResponse({ error: '验证码已发送，请 1 分钟后再试' }, 429);
  }

  // 生成 6 位验证码
  const code = String(Math.floor(100000 + Math.random() * 900000));
  await env.BOSS_KV.put('code:' + emailKey, JSON.stringify({
    code,
    expires: Date.now() + 5 * 60 * 1000
  }), { expirationTtl: 300 });

  // 邮件正文
  const htmlBody = '<div style="font-family:system-ui,sans-serif;padding:24px;max-width:480px;margin:0 auto;background:#f9f9f9">'
    + '<div style="background:#fff;padding:24px;border-radius:8px;box-shadow:0 1px 3px rgba(0,0,0,0.1)">'
    + '<h2 style="color:#333;margin:0 0 16px">Boss海投助手 登录验证码</h2>'
    + '<p style="color:#666;margin:0 0 8px">您正在登录 Boss海投助手，验证码为：</p>'
    + '<h1 style="color:#4CAF50;font-size:36px;letter-spacing:6px;margin:8px 0;text-align:center">' + code + '</h1>'
    + '<p style="color:#999;font-size:13px;margin:16px 0 0">验证码 5 分钟内有效，请勿泄露给他人。如非本人操作请忽略此邮件。</p>'
    + '</div></div>';

  // 优先用阿里云邮件推送（国内送达率好）
  if (env.ALIYUN_ACCESS_KEY_ID && env.ALIYUN_ACCESS_KEY_SECRET) {
    const result = await sendByAliyunDirectMail(env, emailKey, '登录验证码', htmlBody);
    if (result.success) {
      return jsonResponse({ success: true, message: '验证码已发送到 ' + emailKey });
    }
    return jsonResponse({ error: '邮件发送失败: ' + result.error }, 500);
  }

  // 备用：Resend（海外，送达国内可能不稳）
  if (env.RESEND_API_KEY) {
    const sendResp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + env.RESEND_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Boss海投助手 <noreply@luckyioo.cc.cd>',
        to: [emailKey],
        subject: '登录验证码',
        html: htmlBody
      })
    });
    if (!sendResp.ok) {
      const errText = await sendResp.text().catch(() => '');
      return jsonResponse({ error: '邮件发送失败: ' + sendResp.status + ' ' + errText.slice(0, 200) }, 500);
    }
    return jsonResponse({ success: true, message: '验证码已发送到 ' + emailKey });
  }

  // 未配置邮件服务：开发模式，直接返回验证码（仅供测试）
  return jsonResponse({ success: true, message: '开发模式：邮件服务未配置，验证码直接返回', dev_code: code });
}

// ── 阿里云邮件推送（DirectMail）SingleSendMail ──
// 文档：https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail
// 签名：阿里云 RPC API V1 签名（HMAC-SHA1）
async function sendByAliyunDirectMail(env, toAddress, subject, htmlBody) {
  const accessKeyId = env.ALIYUN_ACCESS_KEY_ID;
  const accessKeySecret = env.ALIYUN_ACCESS_KEY_SECRET;
  const fromAlias = 'Boss海投助手';
  const fromAddress = 'noreply@luckyioo.cc.cd';
  const region = 'cn-hangzhou';

  // 1. 组装公共参数
  const params = {
    Action: 'SingleSendMail',
    AccountName: fromAddress,
    AddressType: 1,
    ReplyToAddress: 'false',
    ToAddress: toAddress,
    FromAlias: fromAlias,
    Subject: subject,
    HtmlBody: htmlBody,
    Format: 'JSON',
    Version: '2015-11-23',
    AccessKeyId: accessKeyId,
    SignatureMethod: 'HMAC-SHA1',
    Timestamp: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
    SignatureVersion: '1.0',
    SignatureNonce: crypto.randomUUID(),
    RegionId: region
  };

  // 2. 排序 + 拼接 CanonicalizedQueryString
  // 注意：阿里云用 RFC 3986 编码，需要把 !*'() 也编码掉
  const fixedEncode = (str) => encodeURIComponent(String(str)).replace(/[!'()*]/g, c =>
    '%' + c.charCodeAt(0).toString(16).toUpperCase()
  );
  const sortedKeys = Object.keys(params).sort();
  const canonicalPairs = sortedKeys.map(k =>
    fixedEncode(k) + '=' + fixedEncode(params[k])
  );
  const canonicalQuery = canonicalPairs.join('&');

  // 3. 构造 StringToSign
  const stringToSign = 'GET&' + fixedEncode('/') + '&' + fixedEncode(canonicalQuery);

  // 4. HMAC-SHA1 签名（key = AccessKeySecret + "&"）
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(accessKeySecret + '&'),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(stringToSign));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBuf)));

  // 5. 发起请求（用主域名 dm.aliyuncs.com，避免区域子域名 DNS 问题）
  const url = 'https://dm.aliyuncs.com/?' + canonicalQuery + '&Signature=' + fixedEncode(signature);
  const resp = await fetch(url, { method: 'GET' });
  const respText = await resp.text();
  let data;
  try {
    data = JSON.parse(respText);
  } catch (e) {
    return { success: false, error: 'HTTP ' + resp.status + ' 非JSON响应: ' + respText.slice(0, 300) };
  }

  if (data.Code || data.Message) {
    return { success: false, error: data.Code + ': ' + data.Message };
  }
  return { success: true, envId: data.EnvId, RequestId: data.RequestId };
}

// ── 验证码登录（注册+登录合一）──
async function handleLogin(request, env) {
  const body = await request.json();
  const { email, code } = body;
  if (!email || !code) return jsonResponse({ error: '缺少参数' }, 400);

  const emailKey = email.toLowerCase().trim();

  // 1. 校验验证码
  const codeData = await env.BOSS_KV.get('code:' + emailKey, 'json');
  if (!codeData) return jsonResponse({ error: '验证码不存在或已过期，请重新发送' }, 400);
  if (Date.now() > codeData.expires) return jsonResponse({ error: '验证码已过期，请重新发送' }, 400);
  if (codeData.code !== String(code).trim()) return jsonResponse({ error: '验证码不正确' }, 400);

  // 2. 删除验证码（一次性使用）
  await env.BOSS_KV.delete('code:' + emailKey);

  // 3. 查找或创建账号（邮箱 → client_id 映射）
  let account = await env.BOSS_KV.get('account:' + emailKey, 'json');
  let clientId;
  let isNewUser = false;
  if (!account) {
    // 新用户：生成 client_id
    clientId = 'usr_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    account = { client_id: clientId, email: emailKey, created: Date.now() };
    await env.BOSS_KV.put('account:' + emailKey, JSON.stringify(account));
    // 初始化用户数据（送免费额度）
    await getOrCreateUser(env, clientId);
    isNewUser = true;
  } else {
    clientId = account.client_id;
  }

  // 4. 生成 session token（30 天有效）
  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  await env.BOSS_KV.put('session:' + token, JSON.stringify({
    email: emailKey,
    client_id: clientId,
    expires: Date.now() + 30 * 24 * 60 * 60 * 1000
  }), { expirationTtl: 30 * 24 * 60 * 60 });

  // 5. 返回 token + client_id + 余额
  const userData = await getOrCreateUser(env, clientId);
  return jsonResponse({
    success: true,
    token,
    client_id: clientId,
    credits: userData.credits,
    total_delivered: userData.total_delivered || 0,
    is_new_user: isNewUser,
    message: isNewUser ? '注册成功！已赠送 ' + FREE_CREDITS + ' 个免费投递额度' : '登录成功'
  });
}

// ── 检查 session 是否有效（用于插件启动时恢复登录状态）──
async function handleCheckSession(request, env) {
  const body = await request.json();
  const { token } = body;
  if (!token) return jsonResponse({ valid: false }, 400);

  const session = await env.BOSS_KV.get('session:' + token, 'json');
  if (!session) return jsonResponse({ valid: false }, 200);
  if (Date.now() > session.expires) {
    await env.BOSS_KV.delete('session:' + token);
    return jsonResponse({ valid: false }, 200);
  }

  const userData = await getOrCreateUser(env, session.client_id);
  return jsonResponse({
    valid: true,
    client_id: session.client_id,
    email: session.email,
    credits: userData.credits,
    total_delivered: userData.total_delivered || 0
  });
}

// ── 工具函数 ──
function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}
