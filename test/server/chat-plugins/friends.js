/**
* Tests for the friends list chat plugin. By Mia
* @author mia-pi-git
*/
'use strict';

const assert = require('../../assert');

describe.skip("Friends lists", () => {
	let FriendsDatabase, Config;
	before(async () => {
		({ FriendsDatabase } = await import('../../../dist/server/friends.js'));
		({ Config } = await import('../../../dist/server/config-loader.js'));
	});
	const test = (Config.usesqlite ? it : it.skip);
	test("Should properly setup database", () => {
		assert.doesNotThrow(() => FriendsDatabase.setupDatabase(':memory:'));
	});
});
