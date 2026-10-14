import { render } from 'preact'
import '@fontsource/fredoka/500.css'
import '@fontsource/fredoka/600.css'
import '@fontsource/fredoka/700.css'
import '@fontsource/nunito/600.css'
import '@fontsource/nunito/700.css'
import '@fontsource/nunito/800.css'
import './styles.css'
import { App } from './App'
import { installButtonSounds } from './audio/buttons'

installButtonSounds()
render(<App />, document.getElementById('app')!)
