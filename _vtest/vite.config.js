import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import tw from '@tailwindcss/vite';import path from 'path';
const d=(f)=>path.resolve(__dirname,f);
export default defineConfig({root:__dirname,plugins:[react(),tw()],server:{port:5199,fs:{strict:false}},resolve:{alias:[{find:'firebase/firestore',replacement:d('fs.js')},{find:'firebase/functions',replacement:d('fn.js')},{find:/^\.\.\/firebase$/,replacement:d('fb.js')},{find:/^\.\.\/lib\/audit$/,replacement:d('au.js')},{find:/^\.\.\/context\/AuthContext$/,replacement:d('ac.js')}]}});
