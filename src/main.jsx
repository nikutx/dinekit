import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, CssBaseline } from '@mui/material';
import theme from './theme';
import App from './App';
import { ToastProvider } from './components/Toast';
import './index.css';

const mount = document.getElementById( 'dinekit-root' );
if ( mount ) {
	createRoot( mount ).render(
		<React.StrictMode>
			<ThemeProvider theme={ theme }>
				<CssBaseline />
				<ToastProvider>
					<App />
				</ToastProvider>
			</ThemeProvider>
		</React.StrictMode>
	);
}
