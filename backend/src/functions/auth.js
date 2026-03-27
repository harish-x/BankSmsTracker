const { app } = require('@azure/functions');
const { register, login, refreshAccessToken } = require('../auth');

app.http('register', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { name, email, password } = body;

            if (!name || !email || !password) {
                return { status: 400, jsonBody: { error: 'Name, email, and password are required' } };
            }

            const result = await register(name, email, password);
            return { status: 201, jsonBody: result };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 400, jsonBody: { error: error.message } };
        }
    }
});

app.http('login', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { email, password } = body;

            if (!email || !password) {
                return { status: 400, jsonBody: { error: 'Email and password are required' } };
            }

            const result = await login(email, password);
            return { jsonBody: result };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 401, jsonBody: { error: error.message } };
        }
    }
});

app.http('refreshToken', {
    methods: ['POST'],
    authLevel: 'anonymous',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { refreshToken } = body;

            if (!refreshToken) {
                return { status: 400, jsonBody: { error: 'Refresh token is required' } };
            }

            const result = await refreshAccessToken(refreshToken);
            return { jsonBody: result };
        } catch (error) {
            context.log('ERROR:', error.message);
            return { status: 401, jsonBody: { error: error.message } };
        }
    }
});
