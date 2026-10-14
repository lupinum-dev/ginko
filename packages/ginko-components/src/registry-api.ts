// Registry entries of the api block. Spread into `components` in `registry.ts`. Pure data, no Vue.
// One `api-param` per parameter or field; its Markdown content is the description. Parameters with the same
// `group` are shown together, one tab per group.
import { f } from '@lupinum/ginko'
import { defineComponents } from '@lupinum/ginko/internal'
import { appearance } from './fields.ts'

export const apiComponents = defineComponents({
  api: {
    kind: 'block',
    label: { de: 'API-Schnittstelle', en: 'API endpoint' },
    describe: {
      de: 'Beschreibt eine HTTP-Schnittstelle: Methode und Pfad, darunter die Parameter und Felder in Gruppen.',
      en: 'Describes an HTTP endpoint: method and path, with the parameters and fields below in groups.',
    },
    props: {
      title: f.text({ de: 'Titel', en: 'Title' }, { optional: true, max: 120, hint: { de: 'Wird gezeigt, wenn weder Methode noch Pfad gesetzt sind.', en: 'Shown when neither method nor path is set.' } }),
      method: f.choice({ de: 'Methode', en: 'Method' }, {
        options: [
          { value: 'get', label: 'GET' }, { value: 'post', label: 'POST' }, { value: 'put', label: 'PUT' }, { value: 'patch', label: 'PATCH' },
          { value: 'delete', label: 'DELETE' }, { value: 'head', label: 'HEAD' }, { value: 'options', label: 'OPTIONS' },
        ],
        optional: true,
      }),
      path: f.text({ de: 'Pfad', en: 'Path' }, { optional: true, max: 300, hint: { de: 'Zum Beispiel /v1/gaerten/{id}.', en: 'For example /v1/gardens/{id}.' } }),
      appearance,
    },
    children: ['api-param'],
    editor: {
      group: { de: 'API', en: 'API' },
      example: ':::api{method="get" path="/v1/gaerten"}\n::api-param{name="limit" group="Query" type="number" defaultValue="20" since="1.2"}\nAnzahl der Einträge, höchstens `100`.\n::\n::api-param{name="id" group="Antwort" type="string" required}\nDie Kennung des Gartens.\n::\n:::',
    },
  },
  'api-param': {
    kind: 'block',
    label: { de: 'Parameter', en: 'Parameter' },
    describe: {
      de: 'Ein Parameter oder Feld der API-Schnittstelle. Der Inhalt ist die Beschreibung.',
      en: 'A parameter or field of the endpoint. The content is the description.',
    },
    props: {
      name: f.text({ de: 'Name', en: 'Name' }, { max: 80 }),
      group: f.text({ de: 'Gruppe', en: 'Group' }, { optional: true, max: 40, hint: { de: 'Zum Beispiel Query, Body oder Antwort. Ohne Angabe: „Parameter“.', en: 'For example Query, Body or Response. If empty: “Parameters”.' } }),
      type: f.text({ de: 'Typ', en: 'Type' }, { optional: true, max: 120, hint: { de: 'Zum Beispiel string oder number[].', en: 'For example string or number[].' } }),
      required: f.boolean({ de: 'Erforderlich', en: 'Required' }, { optional: true, hint: { de: 'An: der Parameter bekommt die Marke „Erforderlich“.', en: 'On: the parameter gets a “Required” badge.' } }),
      deprecated: f.boolean({ de: 'Veraltet', en: 'Deprecated' }, { optional: true }),
      since: f.text({ de: 'Seit Version', en: 'Since version' }, { optional: true, max: 20 }),
      defaultValue: f.text({ de: 'Standardwert', en: 'Default value' }, { optional: true, max: 80 }),
    },
    parents: ['api'],
    editor: {
      group: { de: 'API', en: 'API' },
      example: ':::api{method="post" path="/v1/gaerten"}\n::api-param{name="name" group="Body" type="string" required}\nDer Name des Gartens.\n::\n::api-param{name="flaeche" group="Body" type="number" deprecated}\nNutze stattdessen `area`.\n::\n:::',
    },
  },
})
