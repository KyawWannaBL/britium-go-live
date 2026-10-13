import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
const server=await createServer({server:{middlewareMode:true},appType:'custom',optimizeDeps:{noDiscovery:true,include:[]}});
try{
 const {ResizablePanelGroup,ResizablePanel,ResizableHandle}=await server.ssrLoadModule('/src/components/ui/resizable.tsx');
 const html=renderToStaticMarkup(React.createElement(ResizablePanelGroup,{direction:'horizontal'},React.createElement(ResizablePanel,{defaultSize:50},'Parcel editor'),React.createElement(ResizableHandle,{withHandle:true}),React.createElement(ResizablePanel,{defaultSize:50},'Parcel list')));
 assert.match(html,/data-panel-resize-handle/);assert.match(html,/Parcel editor/);assert.match(html,/Parcel list/);assert.match(html,/data-panel-group-direction="horizontal"/);
 console.log('PASS: actual resizable wrapper renders both panels and handle with compatible dependency exports');
}finally{await server.close();}
