/**
 * Bump the DineKit version everywhere it lives, commit, and tag.
 *
 *   node bump.js 1.1.0            # sets version to 1.1.0, commits, tags 1.1.0
 *   node bump.js 1.1.0 --no-git   # just rewrite files (no commit/tag)
 *
 * Pushing the tag (git push origin HEAD --tags) triggers .github/workflows/deploy.yml,
 * which builds and releases to wordpress.org via SVN. Run from plugin/dinekit/.
 * (ESM — package.json has "type": "module".)
 */
import fs from 'node:fs';
import cp from 'node:child_process';

const version = process.argv[ 2 ];
const noGit = process.argv.includes( '--no-git' );

if ( ! /^\d+\.\d+\.\d+$/.test( version || '' ) ) {
	console.error( 'usage: node bump.js <X.Y.Z> [--no-git]' );
	process.exit( 1 );
}

const edits = [
	{ file: 'dinekit.php', subs: [
		[ /(\*\s*Version:\s*)\d+\.\d+\.\d+/, `$1${ version }` ],
		[ /(DINEKIT_VERSION',\s*')\d+\.\d+\.\d+/, `$1${ version }` ],
	] },
	{ file: 'readme.txt', subs: [
		[ /(Stable tag:\s*)\d+\.\d+\.\d+/, `$1${ version }` ],
	] },
	{ file: 'package.json', subs: [
		[ /("version":\s*")\d+\.\d+\.\d+/, `$1${ version }` ],
	] },
];

for ( const { file, subs } of edits ) {
	let s = fs.readFileSync( file, 'utf8' );
	for ( const [ re, rep ] of subs ) {
		if ( ! re.test( s ) ) {
			console.error( `✗ pattern ${ re } not found in ${ file } — aborting, nothing written` );
			process.exit( 1 );
		}
		s = s.replace( re, rep );
	}
	fs.writeFileSync( file, s );
	console.log( `✓ ${ file } → ${ version }` );
}

// Keep package-lock.json's version in sync, or the release workflow's `npm ci`
// fails (it requires the lockfile to match package.json). Lock-file only — no
// dependency changes.
cp.execSync( 'npm install --package-lock-only --no-audit --no-fund', { stdio: 'inherit' } );
console.log( `✓ package-lock.json → ${ version }` );

if ( noGit ) {
	console.log( '\n--no-git: files rewritten, no commit/tag.' );
	process.exit( 0 );
}

cp.execSync( 'git add dinekit.php readme.txt package.json package-lock.json', { stdio: 'inherit' } );
cp.execSync( `git commit -m "chore(release): v${ version }"`, { stdio: 'inherit' } );
cp.execSync( `git tag ${ version }`, { stdio: 'inherit' } );

console.log( `\n🎉 Committed + tagged ${ version }.` );
console.log( 'Push to release on wordpress.org:\n  git push origin HEAD --tags' );
