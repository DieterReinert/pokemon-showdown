"use strict";

const fs = require("fs");
const child_process = require("child_process");
const path = require("path");
const { transform } = require("oxc-transform");

function rewriteRelativeSpecifiersToJs(code) {
	const addJsExt = spec => {
		if (/^(\.{1,2}\/)/.test(spec) && !/\.(js|mjs|cjs|json)$/.test(spec)) return spec + '.js';
		return spec;
	};
	// import ... from '...'
	code = code.replace(/(import\s+[^'";]*?from\s*)(["'])([^"']+?)\2/g, (m, p1, q, spec) => p1 + q + addJsExt(spec) + q);
	// side-effect import '...'
	code = code.replace(/(^|[;\n\r\t ])import\s*(["'])([^"']+?)\2/g, (m, pfx, q, spec) => pfx + 'import ' + q + addJsExt(spec) + q);
	// // export ... from '...'
	code = code.replace(/(export\s+[^'";]*?from\s*)(["'])([^"']+?)\2/g, (m, p1, q, spec) => p1 + q + addJsExt(spec) + q);
	// dynamic import('...')
	code = code.replace(/import\(\s*(["'])([^"']+?)\1\s*\)/g, (m, q, spec) => 'import(' + q + addJsExt(spec) + q + ')');
	return code;
}

const copyOverDataJSON = (file = 'data') => {
	const files = fs.readdirSync(file);
	for (const f of files) {
		if (fs.statSync(`${file}/${f}`).isDirectory()) {
			copyOverDataJSON(`${file}/${f}`);
		} else if (f.endsWith('.json')) {
			const dest = path.resolve('dist', `${file}/${f}`);
			fs.mkdirSync(path.dirname(dest), { recursive: true });
			fs.copyFileSync(`${file}/${f}`, dest);
		}
	}
};

const shouldBeCompiled = file => {
	if (file.includes('node_modules/')) return false;
	if (file.endsWith('.tsx')) return true;
	if (file.endsWith('.ts')) return !(file.endsWith('.d.ts') || file.includes('global'));
	return false;
};

const findFilesForPath = path => {
	const out = [];
	const files = fs.readdirSync(path);
	for (const file of files) {
		const cur = `${path}/${file}`;
		// HACK: Logs and databases exclusions are a hack. Logs is too big to
		// traverse, databases adds/removes files which can lead to a filesystem
		// race between readdirSync and statSync. Please, at some point someone
		// fix this function to be more robust.
		if (cur.includes('node_modules') || cur.includes("/logs") || cur.includes("/databases")) continue;
		if (fs.statSync(cur).isDirectory()) {
			out.push(...findFilesForPath(cur));
		} else if (shouldBeCompiled(cur)) {
			out.push(cur);
		}
	}
	return out;
};

exports.transpile = (force, decl) => {
	const entries = findFilesForPath('./');
	for (const inFile of entries) {
		const source = fs.readFileSync(inFile, 'utf8');
		const isTSX = inFile.endsWith('.tsx');

		const result = transform(inFile, source, {
			sourcemap: true,
			target: 'es2020',
			lang: isTSX ? 'tsx' : 'ts',
			assumptions: { setPublicClassFields: true },
			typescript: { removeClassFieldsWithoutInitializer: true, rewriteImportExtensions: 'rewrite' },
			jsx: isTSX ? { runtime: 'classic', pragma: 'Chat.h', pragmaFrag: 'Chat.Fragment' } : undefined,
		});

		const outPath = path.resolve('dist', inFile).replace(/\.(ts|tsx)$/i, '.js');
		fs.mkdirSync(path.dirname(outPath), { recursive: true });

		let code = result && result.code != null ? String(result.code) : '';
		code = rewriteRelativeSpecifiersToJs(code);
		const map = result && result.map != null ? result.map : null;

		if (map && !/\/# sourceMappingURL=/.test(code)) {
			const mapFileName = path.basename(outPath) + '.map';
			code += (code.endsWith('\n') ? '' : '\n') + `//# sourceMappingURL=${mapFileName}` + '\n';
		}

		fs.writeFileSync(outPath, code);
		if (map) {
			const mapText = typeof map === 'string' ? map : JSON.stringify(map);
			fs.writeFileSync(outPath + '.map', mapText);
		}
	}

	const configDest = './dist/config/config-example.js';
	fs.mkdirSync(path.dirname(configDest), { recursive: true });
	fs.copyFileSync('./config/config-example.js', configDest);
	copyOverDataJSON();

	if (force) {
		exports.buildDecls();
	}
};

exports.buildDecls = () => {
	try {
		child_process.execSync(`node ./node_modules/typescript/bin/tsc -p sim`, { stdio: 'inherit' });
	} catch {}
};
