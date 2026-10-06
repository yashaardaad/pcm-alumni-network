import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'PCM Alumni Network',
    short_name: 'PCM Alumni',
    description: 'Where Plintus Capital Management alumni and current members connect.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F4EC',
    theme_color: '#5A242C',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  };
}
