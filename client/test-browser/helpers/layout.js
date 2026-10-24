import { fixture, CUENTA, OTRA, IMAGEN, PUBLICACION_AJENA } from './kit.js';

const date = '2026-10-20T12:00:00Z';
export const circleDescription = 'Descripción larga para comprobar las columnas del formulario y de las tarjetas.';
export const post = { ...PUBLICACION_AJENA, _id: 'post-layout', media: { type: 'image', url: '/uploads/layout-image.png', alt: 'Foto de prueba' },
  poll: { question: '¿Qué formato te gusta más?', options: [{ _id: 'a', text: 'Fotografía y publicación con descripción extensa', percentage: 75, votes: 3 }, { _id: 'b', text: 'Video', percentage: 25, votes: 1 }], totalVotes: 4 },
  event: { title: 'Encuentro de la comunidad', startsAt: '2027-01-01T12:00:00Z', locationType: 'online', location: 'En la comunidad' }
};
const videos = ['queued', 'processing', 'completed', 'failed'].map((status, i) => ({ _id: `video-${i}`, status, createdAt: date, prompt: `Video ${status}: una descripción para revisar el salto de línea.`, progress: i === 1 ? 45 : 0, videoUrl: status === 'completed' ? '/uploads/layout-video.mp4' : '', error: status === 'failed' ? 'No se pudo generar el video.' : '' }));
const images = [{ _id: 'image-layout', status: 'completed', imageUrl: '/uploads/layout-image.png', createdAt: date, prompt: 'Fotografía de ejemplo en la biblioteca.' }];
const stories = [{ _id: 'story-layout', media: post.media, isActive: true, createdAt: date, expiresAt: '2027-01-01T12:00:00Z', viewsCount: 2, repliesCount: 0, mine: true }];

/** Datos deterministas para medir CSS real; no accede a cuentas ni API reales. */
export async function layoutFixture(page, { admin = false } = {}) {
  await fixture(page, admin ? { ...CUENTA, role: "admin" } : CUENTA);
  await page.route('**/uploads/layout-image.png', r => r.fulfill({ body: IMAGEN, contentType: 'image/png' }));
  await page.route('**/uploads/layout-video.mp4', r => r.fulfill({ status: 204 }));
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname.replace('/api', '');
    let json;
    if (path === '/circles') json = { circles: [{ _id: 'circle-layout', name: 'Amigos de la comunidad', description: circleDescription, membersCount: 5 }] };
    else if (path === '/ai/images/history') json = { generations: images };
    else if (path === '/ai/videos/history') json = { generations: videos };
    else if (/\/ai\/videos\/video-\d\/status/.test(path)) json = { generation: videos.find(v => path.includes(v._id)) };
    else if (path === '/ai/scripts/history') json = { generations: [] };
    else if (path === '/stories/me/archive') json = { stories };
    else if (path === '/stories') json = { groups: [] };
    else if (path === '/posts/vertical') json = { posts: [{ ...post, media: { type: 'video', url: '/uploads/layout-video.mp4' } }], hasMore: false };
    else if (path === '/posts/post-layout') json = { post };
    else if (path.startsWith('/posts')) json = { posts: [post], hasMore: false };
    else if (path === '/notifications') json = { notifications: [{ _id: 'notification-layout', type: 'comment', actor: OTRA, post: 'post-layout', read: false, createdAt: date }], unreadCount: 1, hasMore: false };
    else if (path === '/analytics/creator') json = { totals: { posts: 2, likes: 3, comments: 1, saves: 0, remixes: 0 }, timeline: [], topPosts: [], scope: 'own' };
    else if (path === '/admin/overview') json = { users: 2, posts: 1, pendingReports: 0, hiddenPosts: 0 };
    else if (path === '/admin/users') json = { users: [CUENTA, OTRA] };
    else if (path === '/collections') json = { collections: [{ _id: 'collection-layout', name: 'Inspiración', description: 'Fotos guardadas', postsCount: 2 }] };
    else if (path === '/messages/other') json = { user: OTRA, messages: [{ _id: 'dm-layout', sender: OTRA, recipient: CUENTA, text: 'Mensaje de prueba', createdAt: date }], online: true };
    else if (path === '/conversations/group-layout/messages') json = { conversation: { _id: 'group-layout', name: 'Grupo de prueba', createdBy: CUENTA, members: [CUENTA, OTRA] }, messages: [] };
    else if (path === '/projects') json = { projects: [] };
    else return route.fallback();
    return route.fulfill({ json });
  });
}
