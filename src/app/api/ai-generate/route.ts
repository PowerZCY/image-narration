import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { error } from 'console';
import { appConfig } from '@/lib/appConfig';

export async function POST(req: Request) {
  const { prompt, maxChars } = await req.json();
  // TODO: DPA
  console.warn('[NewsUI]', { prompt, maxChars });
  const limitMaxChars = Math.min(appConfig.newsAI.limitMaxChars, maxChars);
  const fullPrompt = `${prompt}\nResult no more than ${limitMaxChars} characters, and as short and clear as possible, just in pure plain text without any text style or any character count`;
  
  const modelName = appConfig.newsAI.modelName;
  const enableMock = appConfig.newsAI.enableMock;

  if (enableMock) {
    console.warn('[AI-Mock-Switch]', enableMock);
    // mock mode, return mock data
    if (process.env.NODE_ENV !== 'production' && appConfig.newsAI.enableMockTimeout) {
      // mock timeout 3s
      const timeout = appConfig.newsAI.mockTimeoutSeconds * 1000;
      console.warn(`[AI-Mock-Timeout]${timeout}ms`);
      await new Promise(resolve => setTimeout(resolve, timeout));
    }
    if (process.env.NODE_ENV !== 'production' && appConfig.newsAI.enableMockAds) {
        // mock ads dialog
        throw  error('MOCK TEST!')
    }
    const mockText = `[MockData] ${fullPrompt}`;
    return Response.json({ text: mockText });
  }

  // print request log, TODO: DPA
  console.warn('[AI-Request]', { modelName, prompt, maxChars, fullPrompt });
  
  const openrouter = createOpenRouter({ apiKey:  appConfig.newsAI.apiKey});
  const response = streamText({
    model: openrouter(modelName),
    prompt: fullPrompt,
  });

  await response.consumeStream();
  // console.log('[AI-Response]', { response });
  const text = await response.text;
  // print AI response log, TODO: DPA
  console.warn('[AI-Response]', { text });
  return Response.json({ text });
}
