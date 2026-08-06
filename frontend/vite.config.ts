import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

export default defineConfig({
	plugins: [sveltekit(), basicSsl()],
	server: {
		port: 3000,
		strictPort: false,
		watch: {
			usePolling: true,
		},
		proxy: {
			'/api': {
				target: process.env.API_TARGET || 'http://127.0.0.1:5000',
				changeOrigin: true
			},
			'/socket.io': {
				target: process.env.API_TARGET || 'http://127.0.0.1:5000',
				changeOrigin: true,
				ws: true
			}
		}
	}
});
