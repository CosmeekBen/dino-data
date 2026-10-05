import { createRoot } from 'react-dom/client'
import App from './App'
import { installTextures } from './lib/textures'
import '@fontsource-variable/bricolage-grotesque/opsz.css'
import '@fontsource/ibm-plex-mono/latin-400.css'
import '@fontsource/ibm-plex-mono/latin-500.css'
import './styles.css'

installTextures()
createRoot(document.getElementById('root')!).render(<App />)
