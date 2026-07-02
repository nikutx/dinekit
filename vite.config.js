import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// The Local (by WP Engine) dev host. Override per machine with DINEKIT_DEV_HOST.
const DEV_HOST = process.env.DINEKIT_DEV_HOST || 'dinekit-dev.local';
const DEV_PORT = 5174;

export default defineConfig( {
	plugins: [ react() ],
	base: './',

	server: {
		host: DEV_HOST,
		port: DEV_PORT,
		strictPort: true,
		cors: {
			origin: `http://${ DEV_HOST }`,
			credentials: true,
		},
		hmr: {
			host: DEV_HOST,
			protocol: 'ws',
			port: DEV_PORT,
		},
	},

	build: {
		outDir: path.resolve( __dirname, 'dist' ),
		emptyOutDir: true,
		manifest: false,
		rollupOptions: {
			input: path.resolve( __dirname, 'src/main.jsx' ),
			output: {
				// IIFE = a self-contained classic script, enqueued normally by WP
				// (no type=module), which avoids module load-timing quirks in
				// wp-admin.
				format: 'iife',
				inlineDynamicImports: true,
				entryFileNames: 'main.js',
				assetFileNames: ( assetInfo ) => {
					if ( assetInfo.name && assetInfo.name.endsWith( '.css' ) ) {
						return 'main.css';
					}
					return '[name][extname]';
				},
			},
		},
	},
} );
