import { addons } from 'storybook/manager-api'
import { themes } from 'storybook/theming'

// The Storybook shell (sidebar, toolbar) matches the app's dark theme.
addons.setConfig({ theme: themes.dark })
