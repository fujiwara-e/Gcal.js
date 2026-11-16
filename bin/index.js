#!/usr/bin/env node

if (process.argv[2] === 'md') {
  try {
    const { runMarkdownExport } = await import('../src/commands/markdownExport.js');
    process.exitCode = await runMarkdownExport(process.argv.slice(3));
  } catch (error) {
    console.error(`cldr md: ${error.message}`);
    process.exitCode = 1;
  }
} else {
  const { runApp } = await import('../src/app.js');
  await runApp();
}
