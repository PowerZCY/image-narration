/* eslint-disable @typescript-eslint/no-explicit-any */
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { error } from 'console';
import { appConfig } from '@/lib/appConfig';

// 支持的翻译语言
const SUPPORTED_LANGUAGES = ['English', 'Japanese', 'Spanish', 'Chinese'] as const;
type SupportedLanguage = typeof SUPPORTED_LANGUAGES[number];

const appHeaders = {
  "HTTP-Referer": appConfig.baseUrl,
  "X-Title": appConfig.imageAI.appName
}

// 公共的mock处理逻辑
async function handleMockResponse(mockType: 'image' | 'translate', params: any) {
  if (!appConfig.imageAI.enableMock) {
    return null;
  }

  console.warn('[AI-Mock-Switch]', appConfig.imageAI.enableMock);
  
  // Mock timeout
  if (process.env.NODE_ENV !== 'production' && appConfig.imageAI.enableMockTimeout) {
    const mockTimeout = appConfig.imageAI.mockTimeoutSeconds * 1000;
    console.warn(`[AI-Mock-Timeout]${mockTimeout}ms`);
    await new Promise(resolve => setTimeout(resolve, mockTimeout));
  }
  
  // Mock ads error
  if (process.env.NODE_ENV !== 'production' && appConfig.imageAI.enableMockAds) {
    throw error('MOCK TEST!');
  }
  
  if (mockType === 'image') {
    const { prompt, imageUrl } = params;
    const mockText = `[MockData] Analyzing image: ${imageUrl}. User prompt: ${prompt || 'No specific prompt'}\n\nA solitary figure stands at the edge of a vast, windswept cliff, silhouetted against a sky ablaze with the fiery hues of a setting sun. The horizon is a molten line where deep oranges, radiant pinks, and smoldering reds bleed into the soft indigo of the approaching night.\n\nLong shadows stretch across the rugged terrain behind the person, emphasizing their isolation and stillness amidst the wild landscape. The cliff drops sharply into a churning sea far below, waves crashing against jagged rocks in a rhythmic, thunderous roar that seems to echo even in silence.\n\nThe figure, dressed in a long, flowing coat that flutters in the strong coastal breeze, stands with hands clasped behind their back, gazing out over the endless expanse of ocean. Their posture is contemplative, almost reverent, as if absorbing the magnitude of the moment.`;
    return { text: mockText };
  } else if (mockType === 'translate') {
    const { prompt, language } = params;
    const mockTranslations: Record<string, string> = {
      'English': prompt,
      'Japanese': `[MockData-Japanese] ${prompt}の日本語翻訳です。これは模擬翻訳データです。`,
      'Spanish': `[MockData-Spanish] ${prompt} - Esta es una traducción simulada al español.`,
      'Chinese': `[MockData-Chinese] ${prompt} - 这是模拟的中文翻译数据。`
    };
    return { text: mockTranslations[language] || mockTranslations['English'] };
  }
  
  return null;
}

const timeout = appConfig.imageAI.timeoutSeconds * 1000;

// AI请求超时控制辅助函数
async function applyTimeout<T>(promise: Promise<T>, ms = timeout): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    // 传递 signal 给AI请求
    // promise需支持signal参数
    return await promise;
  } catch (e: any) {
    if (e.name === 'AbortError') {
      throw new Error('AI model request timeout');
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }
}

// POST: 图像描述生成
export async function POST(req: Request) {
  const { prompt, imageUrl } = await req.json();
  
  // Validate required parameters
  if (!imageUrl) {
    return Response.json({ error: 'imageUrl is required' }, { status: 400 });
  }
  
  // TODO: DPA
  console.warn('[ImageUI]', { prompt, imageUrl });
  
  // 检查mock模式
  const mockResponse = await handleMockResponse('image', { prompt, imageUrl });
  if (mockResponse) {
    return Response.json(mockResponse);
  }
  
  const limitMaxWords = appConfig.imageAI.limitMaxWords;
  const modelName = appConfig.imageAI.modelName;
  
  // Build system prompt for image narration
  const systemPrompt = 'You are an expert image narrator. Analyze the provided image and create a compelling narrative description.'
  + 'In a multi-paragraph format with a general-to-specific structure, the first row is main title.'
  +`${prompt ? `Focus on: ${prompt}` : ''} Keep the result under ${limitMaxWords} words. `
  + 'Clear and engaging English, in pure plain text without any formatting.';

  // Build messages array with image and text
  const messages = [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    {
      role: 'user' as const,
      content: [
        {
          type: 'image' as const,
          image: imageUrl,
        },
        {
          type: 'text' as const,
          text: prompt || 'Please provide a detailed narrative description of this image.',
        },
      ],
    },
  ];

  // print request log, TODO: DPA
  console.warn('[AI-Request]', { modelName, prompt, imageUrl, systemPrompt });
  
  const openrouter = createOpenRouter({
    apiKey: appConfig.imageAI.apiKey,
    headers: appHeaders
  });
  try {
    const response = await applyTimeout(
      (async () => {
        const resp = streamText({
          model: openrouter(modelName),
          messages: messages,
        });
        await resp.consumeStream();
        return await resp.text;
      })(),
      timeout
    );
    // print AI response log, TODO: DPA
    console.warn('[AI-Response]', { text: response });
    return Response.json({ text: response });
  } catch (e: any) {
    if (e.message === 'AI model request timeout') {
      return Response.json({ error: e.message }, { status: 504 });
    }
    throw e;
  }
}

// PUT: 文本翻译
export async function PUT(req: Request) {
  const { prompt, language } = await req.json();
  
  // Validate required parameters
  if (!prompt) {
    return Response.json({ error: 'prompt is required' }, { status: 400 });
  }
  
  if (!language || !SUPPORTED_LANGUAGES.includes(language as SupportedLanguage)) {
    return Response.json({ 
      error: `language must be one of: ${SUPPORTED_LANGUAGES.join(', ')}` 
    }, { status: 400 });
  }
  
  // TODO: DPA
  console.warn('[TranslateUI]', { prompt, language });
  
  // 检查mock模式
  const mockResponse = await handleMockResponse('translate', { prompt, language });
  if (mockResponse) {
    return Response.json(mockResponse);
  }
  
  const modelName = appConfig.imageAI.translationModelName;
  
  // Build system prompt for translation
  const systemPrompt = `You are a professional translator. Translate the provided text to ${language}. Maintain the original meaning, tone, and style. Return only the translated text without any additional comments or formatting.`;

  // Build messages array for translation
  const messages = [
    {
      role: 'system' as const,
      content: systemPrompt,
    },
    {
      role: 'user' as const,
      content: prompt,
    },
  ];

  // print request log, TODO: DPA
  console.warn('[AI-Request]', { modelName, prompt, language, systemPrompt });
  
  const openrouter = createOpenRouter({
    apiKey: appConfig.imageAI.apiKey,
    headers: appHeaders
  });
  try {
    const response = await applyTimeout(
      (async () => {
        const resp = streamText({
          model: openrouter(modelName),
          messages: messages,
        });
        await resp.consumeStream();
        return await resp.text;
      })(),
      timeout
    );
    // print AI response log, TODO: DPA
    console.warn('[AI-Response]', { text: response });
    return Response.json({ text: response });
  } catch (e: any) {
    if (e.message === 'AI model request timeout') {
      return Response.json({ error: e.message }, { status: 504 });
    }
    throw e;
  }
}
