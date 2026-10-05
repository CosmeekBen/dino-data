import { createRoot } from 'react-dom/client'
import App from './App'
import { installTextures } from './lib/textures'
import './styles.css'

installTextures()
createRoot(document.getElementById('root')!).render(<App />)
