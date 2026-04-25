const fs = require('fs');

try {
  let html = fs.readFileSync('index.html', 'utf8');

  // 1. Extract the workspace content
  const startWorkspace = html.indexOf('<div class="quote-workspace">', html.indexOf('page-order-workspace'));
  const orderActions = html.indexOf('<!-- Order Actions -->', startWorkspace);
  const endWorkspace = html.indexOf('</div>\n                    </div>\n                </div>\n            </div>', orderActions);

  if (startWorkspace === -1 || endWorkspace === -1) {
    console.error('Could not parse workspace content! Check indices.');
    process.exit(1);
  }

  const workspaceInner = html.substring(startWorkspace, endWorkspace + 6); // + 6 to include </div>
  const wrappedWorkspace = '<div id="order-editor-container" style="display: none;">\n' + workspaceInner + '\n</div>\n';

  // 2. Remove the old page-order-workspace wrap completely
  const pageStart = html.lastIndexOf('<!-- ORDER WORKSPACE PAGE ', startWorkspace);
  
  html = html.substring(0, pageStart) + html.substring(endWorkspace + 6 + 76); // strip it out. We will fix any trailing tags if necessary, but string replacement is safer.

  // Instead of brittle substring math for removal, let's just use string replacement on what we KNOW is there:
  html = fs.readFileSync('index.html', 'utf8'); // reset
  
  // Cut the whole thing
  const fullBlockRegex = /<!-- ORDER WORKSPACE PAGE \(hidden by default\) -->[\s\S]*?<div id="page-order-workspace" class="page">[\s\S]*?<!-- Order Actions -->[\s\S]*?<\/button>\s*<\/div>\s*<\/div>\s*<\/div>\s*<\/div>/;
  
  const extractedSrc = html.match(fullBlockRegex);
  html = html.replace(fullBlockRegex, '');
  
  // Ensure we didn't wipe everything by mistake
  if (!extractedSrc) throw new Error("Could not find the ORDER WORKSPACE PAGE block");

  // 3. Remove "Nueva Orden" button
  html = html.replace(
    /<button id="add-new-order-page-btn" class="btn btn-primary">[\s\S]*?<\/button>/,
    ''
  );

  // 4. Inject tabs into tabs-container
  const tabsFind = `<div class="tabs-container">
                    <button class="tab-link active" data-tab="pending">Pendientes</button>
                    <button class="tab-link" data-tab="completed">Completadas</button>
                </div>`;
  const tabsReplace = `<div class="tabs-container">
                    <button class="tab-link active" data-tab="pending">Pendientes</button>
                    <button class="tab-link" data-tab="completed">Completadas</button>
                    <div class="tabs-divider"></div>
                    <div id="order-tabs-bar" class="quote-tabs-bar" style="flex: 1; min-height: 48px; border-bottom: none; background: transparent; padding: 0;"></div>
                </div>`;
  html = html.replace(tabsFind, tabsReplace);

  // 5. Inject workspace
  const listFind = `<div id="orders-list-container" class="management-list-container">
                        <!-- Orders table will be rendered here -->
                    </div>`;
  const listReplace = listFind + '\n                    ' + wrappedWorkspace;
  html = html.replace(listFind, listReplace);

  fs.writeFileSync('index.html', html, 'utf8');
  console.log('Successfully updated index.html with architectural changes.');

} catch (e) {
  console.error('Error:', e);
}
