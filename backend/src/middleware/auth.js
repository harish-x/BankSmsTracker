const { verifyToken } = require('../auth');

function authMiddleware(request) {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { error: 'No token provided', status: 401 };
    }

    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);

    if (!decoded) {
        return { error: 'Invalid token', status: 401 };
    }

    return { user: decoded };
}

module.exports = { authMiddleware };