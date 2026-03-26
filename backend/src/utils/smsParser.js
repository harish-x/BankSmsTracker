const normalizeAmount = (amountStr) => {
    if (!amountStr) return null;
    return parseFloat(amountStr.replace(/,/g, ''));
};

const detectType = (msg) => {
    const lower = msg.toLowerCase();

    if (lower.includes('sent') || lower.includes('debited') || lower.includes('withdrawn')) {
        return 'debit';
    }

    if (lower.includes('credited') || lower.includes('deposited') || lower.includes('received')) {
        return 'credit';
    }

    return null;
};

const extractAmount = (msg) => {
    const match =
        msg.match(/(?:Rs\.?|INR)\s?([\d,]+\.\d+)/i) ||
        msg.match(/([\d,]+\.\d+)\s?(?:Rs|INR)/i);

    return normalizeAmount(match?.[1]);
};

const extractAccount = (msg) => {
    const match = msg.match(/(?:A\/C|Acct|Account).*?(\*{0,2}X{0,2})(\d{3,6})/i);

    if (!match) return {};

    return {
        account_mask: match[2]
    };
};

const extractBank = (msg) => {
    const banks = [
        'HDFC',
        'ICICI',
        'SBI',
        'KOTAK',
        'AXIS',
        'INDIAN BANK',
        'TMB',
        'CANARA'
    ];

    const upper = msg.toUpperCase();

    for (let bank of banks) {
        if (upper.includes(bank)) return bank;
    }

    return null;
};

const extractSource = (msg, type) => {
    let source_name = null;
    let source_vpa = null;

    // vpa (upi) pattern
    const vpaMatch = msg.match(/([a-zA-Z0-9.\-_]+@[a-zA-Z]+)/);
    if (vpaMatch) {
        source_vpa = vpaMatch[1];
    }

    // name patterns
    if (type === 'debit') {
        const toMatch = msg.match(/To\s+([^\n]+)/i);
        if (toMatch) source_name = toMatch[1].trim();
    }

    if (type === 'credit' && !source_name) {
        const fromMatch = msg.match(/from\s+([^\n]+)/i);
        if (fromMatch) source_name = fromMatch[1].trim();
    }

    return { source_name, source_vpa };
};

const extractDate = (msg) => {
    const match =
        msg.match(/(\d{2}\/\d{2}\/\d{2})/) ||
        msg.match(/(\d{2}-\d{2}-\d{2})/);

    if (!match) return new Date();

    const [d, m, y] = match[1].replace(/-/g, '/').split('/');
    return new Date(`20${y}`, m - 1, d);
};

const isValidTransaction = (msg) => {
    const lower = msg.toLowerCase();

    if (lower.includes('otp')) return false;
    if (lower.includes('low balance')) return false;
    if (lower.includes('available balance')) return false;

    return true;
};

const parseSMS = (msg) => {
    if (!isValidTransaction(msg)) return null;

    const type = detectType(msg);
    const amount = extractAmount(msg);
    const account = extractAccount(msg);
    const bank = extractBank(msg);
    const source = extractSource(msg, type);
    const date = extractDate(msg);

    return {
        type,
        amount,
        bank_name: bank,
        account_mask: account.account_mask,
        source_name: source.source_name,
        source_vpa: source.source_vpa,
        date
    };
};

module.exports = { parseSMS };