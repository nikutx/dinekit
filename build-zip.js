/**
 * Build an uploadable plugin zip: runs the Vite build, then archives the
 * plugin folder (wrapped in a `dinekit/` dir per WP convention), excluding
 * all dev-only files. Mirrors the approved WLU plugin's packaging.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';
import archiver from 'archiver';

const __filename = fileURLToPath( import.meta.url );
const __dirname = path.dirname( __filename );

const pluginSlug = 'dinekit';

const pkg = JSON.parse( fs.readFileSync( path.join( __dirname, 'package.json' ), 'utf8' ) );
const outputZipName = `${ pluginSlug }-v${ pkg.version }.zip`;
const outputZipPath = path.resolve( __dirname, outputZipName );

console.log( '🚀 Building DineKit zip...' );

try {
	console.log( '📦 Compiling React assets...' );
	execSync( 'npm run build', { stdio: 'inherit' } );
	console.log( '✅ Vite build complete.' );

	const output = fs.createWriteStream( outputZipPath );
	const archive = archiver( 'zip', { zlib: { level: 9 } } );

	output.on( 'close', () => {
		console.log( '\n🎉 ZIP CREATED' );
		console.log( `📦 Size: ${ ( archive.pointer() / 1024 / 1024 ).toFixed( 2 ) } MB` );
		console.log( `📁 ${ outputZipPath }` );
	} );

	archive.on( 'error', ( err ) => {
		throw err;
	} );
	archive.pipe( output );

	archive.glob(
		'**/*',
		{
			cwd: __dirname,
			dot: true,
			ignore: [
				'node_modules/**',
				'src/**',
				'public/**',
				'.git/**',
				'.github/**',
				'.wordpress-org/**',
				'.idea/**',
				'.gitignore',
				'.gitattributes',
				'.distignore',
				'CLAUDE.md',
				'index.html',
				'package.json',
				'package-lock.json',
				'vite.config.js',
				'eslint.config.js',
				'composer.json',
				'phpcs.xml.dist',
				'.wp-env.json',
				'README.md',
				'build-zip.js',
				'bump.js',
				'includes/admin/assets-dev.php',
				'*.zip',
			],
		},
		{ prefix: pluginSlug }
	);

	archive.finalize();
} catch ( error ) {
	console.error( '❌ Zip build failed:', error );
	process.exit( 1 );
}
