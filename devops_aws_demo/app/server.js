const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
  res.send('ok');
});

app.get('/', (req, res) => {
  res.send('Hello from DevOps demo on AWS!');
});

app.listen(port, () => {
  console.log(`App listening on port ${port}`);
});
