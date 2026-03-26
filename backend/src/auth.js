const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { connectToDatabase } = require('./db');
const User = require('./models/user');

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY = '7d';

async function register(name, email, password) {
    await connectToDatabase();
    
    const existingUser = await User.findOne({ email: email.toLowerCase() });
    if (existingUser) {
        throw new Error('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = new User({
        name,
        email: email.toLowerCase(),
        password: hashedPassword
    });

    await user.save();

    const tokens = generateTokens(user._id.toString());
    
    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email
        },
        ...tokens
    };
}

async function login(email, password) {
    await connectToDatabase();
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
        throw new Error('Invalid email or password');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
        throw new Error('Invalid email or password');
    }

    const tokens = generateTokens(user._id.toString());

    return {
        user: {
            id: user._id,
            name: user.name,
            email: user.email
        },
        ...tokens
    };
}

async function refreshAccessToken(refreshToken) {
    try {
        const decoded = jwt.verify(refreshToken, JWT_SECRET + '_refresh');
        
        const newAccessToken = jwt.sign(
            { userId: decoded.userId },
            JWT_SECRET,
            { expiresIn: ACCESS_TOKEN_EXPIRY }
        );

        return { accessToken: newAccessToken };
    } catch (error) {
        throw new Error('Invalid refresh token');
    }
}

function generateTokens(userId) {
    const accessToken = jwt.sign(
        { userId },
        JWT_SECRET,
        { expiresIn: ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
        { userId },
        JWT_SECRET + '_refresh',
        { expiresIn: REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
}

function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

module.exports = {
    register,
    login,
    refreshAccessToken,
    verifyToken,
    JWT_SECRET
};
