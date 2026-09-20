// GET /api/hello  ->  서버가 살아있는지 확인하는 가장 간단한 API
// Azure Static Web Apps가 이 api 폴더를 자동으로 Azure Functions로 배포해 줍니다.
const { app } = require('@azure/functions');

app.http('hello', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'hello',
  handler: async (request, context) => {
    context.log('hello API called');
    return {
      jsonBody: {
        ok: true,
        message: 'Clean Sky API 정상 작동',
        time: new Date().toISOString(),
      },
    };
  },
});
