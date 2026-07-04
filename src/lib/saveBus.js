// Global save-status bus. Every mutating API request (POST/PATCH/PUT/DELETE)
// pings this, and useDineKit subscribes so the topbar "Saving… / All changes
// saved" pill reflects EVERY write from any view — including settings toggles
// that don't go through the central data store. One source of truth for save
// feedback, so no change ever saves silently.
let count = 0;
const subscribers = new Set();

function emit( status ) {
	subscribers.forEach( ( fn ) => fn( status ) );
}

export const saveBus = {
	begin() {
		count += 1;
		emit( 'saving' );
	},
	finish( ok ) {
		count = Math.max( 0, count - 1 );
		if ( count === 0 ) {
			emit( ok ? 'saved' : 'error' );
		}
	},
	subscribe( fn ) {
		subscribers.add( fn );
		return () => subscribers.delete( fn );
	},
};
