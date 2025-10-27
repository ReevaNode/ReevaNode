import path from "path";
import i18n from "i18n";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

i18n.configure({
  locales: ["es", "en"],
  defaultLocale: "es",
  directory: path.join(__dirname, "../languages"),
  queryParameter: "lang", // ?lang=en para pruebas
  autoReload: true,
  updateFiles: false,
  objectNotation: true,
  cookie: "reeva-language",
  register: global,
});

export default i18n;
