import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		port: 3000,
		strictPort: true,
		watch: {
			usePolling: true,
		},
		proxy: {
			'/api': {
				target: 'http://localhost:5000',
				changeOrigin: true
			},
			'/socket.io': {
				target: 'http://localhost:5000',
				changeOrigin: true,
				ws: true
			}
		}
	}
});
