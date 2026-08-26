import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method === 'GET') {
      const id = parseInt(req.query.id, 10);
      if (!id) return res.status(400).json({ error: 'id required' });
      const { data: post, error } = await supabase.from('posts').select('*').eq('id', id).single();
      if (error) throw error;
      const { data: comments, error: cErr } = await supabase
        .from('comments')
        .select('*')
        .eq('post_id', id)
        .order('id', { ascending: true });
      if (cErr) throw cErr;
      return res.status(200).json({ post, comments: comments || [] });
    }

    if (req.method === 'PUT') {
      const { id, action } = req.body || {};
      const pid = parseInt(id, 10);
      if (!pid || action !== 'view') return res.status(400).json({ error: 'invalid request' });
      const { data: post, error } = await supabase.from('posts').select('views_count').eq('id', pid).single();
      if (error) throw error;
      const next = (post?.views_count || 0) + 1;
      const { error: uErr } = await supabase.from('posts').update({ views_count: next }).eq('id', pid);
      if (uErr) throw uErr;
      return res.status(200).json({ views_count: next });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('post api error:', err);
    return res.status(500).json({ error: err.message || 'Server error' });
  }
}
