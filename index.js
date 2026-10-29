import express from 'express';
import api from './src/app.js';

const app = express();

app.get('/', (_req, res) => {
  res.json({
    app: 'Reefer Track API',
    status: 'online'
  });
});

app.use(api);

export default app;