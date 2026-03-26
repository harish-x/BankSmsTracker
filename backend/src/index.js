const { app } = require('@azure/functions');

app.setup({
    enableHttpStream: true,
});

require('./functions/auth');
require('./functions/expensemetric');

module.exports = app;
