import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: './',
  resolve: { extensions: ['.ts', '.tsx', '.js', '.json'] },
})
