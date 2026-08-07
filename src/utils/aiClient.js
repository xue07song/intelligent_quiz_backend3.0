const axios = require('axios');

// 智谱 GLM 客户端：兼容 OpenAI 协议
// 文档：https://open.bigmodel.cn/dev/api
const GLM_BASE_URL = 'https://open.bigmodel.cn/api/paas/v4';

const getConfig = () => {
    const apiKey = process.env.GLM_API_KEY;
    const model = process.env.GLM_MODEL || 'glm-4-flash';
    const timeout = parseInt(process.env.GLM_TIMEOUT) || 60000;
    return { apiKey, model, timeout };
};

// 校验 AI 配置是否就绪
const isConfigured = () => {
    const { apiKey } = getConfig();
    return !!apiKey && !apiKey.includes('请填写');
};

// 通用对话接口
// messages: [{ role: 'system'|'user'|'assistant', content: '...' }]
// options: { temperature, max_tokens, responseFormat: 'json_object'|'text' }
const chat = async (messages, options = {}) => {
    const { apiKey, model, timeout } = getConfig();
    if (!isConfigured()) {
        const err = new Error('AI 服务未配置：请在 .env 中设置 GLM_API_KEY');
        err.statusCode = 500;
        err.errorCode = 50001;
        throw err;
    }

    const body = {
        model,
        messages,
        temperature: options.temperature ?? 0.7,
        max_tokens: options.max_tokens ?? 2048,
    };
    if (options.responseFormat === 'json_object') {
        body.response_format = { type: 'json_object' };
    }

    try {
        const resp = await axios.post(`${GLM_BASE_URL}/chat/completions`, body, {
            timeout,
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
        });
        const content = resp.data?.choices?.[0]?.message?.content || '';
        return content;
    } catch (err) {
        const status = err.response?.status;
        const apiMsg = err.response?.data?.error?.message || err.message;
        const e = new Error(`AI 调用失败：${apiMsg}`);
        e.statusCode = status || 500;
        e.errorCode = 50002;
        throw e;
    }
};

// 便捷方法：要求模型返回 JSON，并自动解析
// 失败时抛出带 errorCode 的错误
const chatJSON = async (messages, options = {}) => {
    const content = await chat(messages, { ...options, responseFormat: 'json_object' });
    try {
        return JSON.parse(content);
    } catch (err) {
        const e = new Error('AI 返回内容无法解析为 JSON');
        e.statusCode = 500;
        e.errorCode = 50003;
        e.raw = content;
        throw e;
    }
};

module.exports = { chat, chatJSON, isConfigured, getConfig };
