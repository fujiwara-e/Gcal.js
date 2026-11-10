import fs from 'fs';

export function parseEditorFields(text, multilineLabel) {
  const lines = text.replace(/\r\n/g, '\n').replace(/\n$/, '').split('\n');
  const details = {};

  for (const [index, line] of lines.entries()) {
    const separator = line.indexOf('|');
    if (separator < 0) continue;

    const label = line.slice(0, separator).trim();
    const value = line.slice(separator + 1);
    if (label === multilineLabel) {
      // The generated template ends with this field, so later lines are all body text.
      details[label] = [value.replace(/^ /, ''), ...lines.slice(index + 1)].join('\n');
      break;
    }
    details[label] = value.trim();
  }

  return details;
}

export async function openExternalEditor(screen, tempFilePath, content) {
  fs.writeFileSync(tempFilePath, content, 'utf8');
  const editor = process.env.EDITOR || 'vim';

  const updatedText = await new Promise(resolve => {
    screen.exec(editor, [tempFilePath], {}, (err, code) => {
      if (err) {
        console.error('Error opening editor:', err);
        resolve(null);
        return;
      }

      if (code !== true) {
        console.log(`Editor exited with code: ${code}`);
        resolve(null);
        return;
      }

      const text = fs.readFileSync(tempFilePath, 'utf8');
      resolve(text);
    });
  });

  if (fs.existsSync(tempFilePath)) {
    fs.unlinkSync(tempFilePath);
  }

  return updatedText;
}
