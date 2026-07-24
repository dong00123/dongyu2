export function notFoundHandler(req, res) {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: '接口不存在' });
  }

  return res.status(404).send('页面不存在');
}
