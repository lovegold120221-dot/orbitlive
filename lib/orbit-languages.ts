/**
 * Target languages offered by the Orbit Live Translator.
 *
 * Codes are ISO 639-1 where a standard two-letter code exists, ISO 639-3
 * otherwise, and BCP-47 script/region subtags where the distinction matters
 * (Chinese script, Brazilian vs European Portuguese, and so on).
 *
 * The translator backend forwards `code` straight to Gemini as
 * `translationConfig.targetLanguageCode` and does NOT validate it, so an
 * unrecognised code makes the backend reject the retarget. The provider
 * reverts to the last working target in that case.
 *
 * Codes marked below as best-effort are the long tail of regional and
 * minority languages where no widely-deployed 2-letter code exists.
 */

export type OrbitLanguage = { code: string; label: string };

/** Kept first in the dropdown as the default target. */
export const ORBIT_LANGUAGES: OrbitLanguage[] = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'nl', label: 'Dutch' },
  { code: 'pl', label: 'Polish' },
  { code: 'cs', label: 'Czech' },
  { code: 'ro', label: 'Romanian' },
  { code: 'hu', label: 'Hungarian' },
  { code: 'el', label: 'Greek' },
  { code: 'ru', label: 'Russian' },
  { code: 'uk', label: 'Ukrainian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'ar', label: 'Arabic' },
  { code: 'he', label: 'Hebrew' },
  { code: 'fa', label: 'Persian' },
  { code: 'hi', label: 'Hindi' },
  { code: 'bn', label: 'Bengali' },
  { code: 'ur', label: 'Urdu' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ms', label: 'Malay' },
  { code: 'vi', label: 'Vietnamese' },
  { code: 'th', label: 'Thai' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'sv', label: 'Swedish' },
  { code: 'fi', label: 'Finnish' },
  { code: 'no', label: 'Norwegian' },
  { code: 'da', label: 'Danish' },

  // A
  { code: 'ab', label: 'Abkhaz' },
  { code: 'ace', label: 'Acehnese' },
  { code: 'ach', label: 'Acholi' },
  { code: 'aa', label: 'Afar' },
  { code: 'af', label: 'Afrikaans' },
  { code: 'sq', label: 'Albanian' },
  { code: 'alur', label: 'Alur' },
  { code: 'am', label: 'Amharic' },
  { code: 'hy', label: 'Armenian' },
  { code: 'as', label: 'Assamese' },
  { code: 'av', label: 'Avar' },
  { code: 'aw', label: 'Awadhi' },
  { code: 'ay', label: 'Aymara' },
  { code: 'az', label: 'Azerbaijani' },

  // B
  { code: 'ban', label: 'Balinese' },
  { code: 'bal', label: 'Baluchi' },
  { code: 'bm', label: 'Bambara' },
  { code: 'bam', label: 'Baoulé' },
  { code: 'ba', label: 'Bashkir' },
  { code: 'eu', label: 'Basque' },
  { code: 'krc', label: 'Batak Karo' },
  { code: 'bbc', label: 'Batak Simalungun' },
  { code: 'bbc2', label: 'Batak Toba' },
  { code: 'be', label: 'Belarusian' },
  { code: 'bem', label: 'Bemba' },
  { code: 'bew', label: 'Betawi' },
  { code: 'bho', label: 'Bhojpuri' },
  { code: 'bik', label: 'Bikol' },
  { code: 'bs', label: 'Bosnian' },
  { code: 'br', label: 'Breton' },
  { code: 'bg', label: 'Bulgarian' },
  { code: 'bua', label: 'Buryat' },

  // C
  { code: 'yue', label: 'Cantonese' },
  { code: 'ca', label: 'Catalan' },
  { code: 'ceb', label: 'Cebuano' },
  { code: 'ch', label: 'Chamorro' },
  { code: 'ce', label: 'Chechen' },
  { code: 'ny', label: 'Chichewa' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
  { code: 'zh-TW', label: 'Chinese (Traditional)' },
  { code: 'chk', label: 'Chuukese' },
  { code: 'cv', label: 'Chuvash' },
  { code: 'co', label: 'Corsican' },
  { code: 'crh', label: 'Crimean Tatar (Cyrillic)' },
  { code: 'crh-Latn', label: 'Crimean Tatar (Latin)' },
  { code: 'hr', label: 'Croatian' },

  // D
  { code: 'prs', label: 'Dari' },
  { code: 'dv', label: 'Dhivehi' },
  { code: 'din', label: 'Dinka' },
  { code: 'doi', label: 'Dogri' },
  { code: 'dje', label: 'Dombe' },
  { code: 'dyu', label: 'Dyula' },
  { code: 'dz', label: 'Dzongkha' },

  // E
  { code: 'eo', label: 'Esperanto' },
  { code: 'et', label: 'Estonian' },
  { code: 'ee', label: 'Ewe' },

  // F
  { code: 'fo', label: 'Faroese' },
  { code: 'fj', label: 'Fijian' },
  { code: 'fil', label: 'Filipino' },
  { code: 'fon', label: 'Fon' },
  { code: 'fr-CA', label: 'French (Canada)' },
  { code: 'fy', label: 'Frisian' },
  { code: 'fur', label: 'Friulian' },
  { code: 'ff', label: 'Fulani' },

  // G
  { code: 'ga-GA', label: 'Ga' },
  { code: 'gl', label: 'Galician' },
  { code: 'ka', label: 'Georgian' },
  { code: 'gn', label: 'Guarani' },
  { code: 'gu', label: 'Gujarati' },

  // H
  { code: 'ht', label: 'Haitian Creole' },
  { code: 'cnh', label: 'Hakha Chin' },
  { code: 'ha', label: 'Hausa' },
  { code: 'haw', label: 'Hawaiian' },
  { code: 'hil', label: 'Hiligaynon' },
  { code: 'hmn', label: 'Hmong' },
  { code: 'hsb', label: 'Hunsrik' },

  // I
  { code: 'iba', label: 'Iban' },
  { code: 'is', label: 'Icelandic' },
  { code: 'ig', label: 'Igbo' },
  { code: 'ilo', label: 'Ilocano' },
  { code: 'iu', label: 'Inuktut (Syllabics)' },
  { code: 'iu-Latn', label: 'Inuktut (Latin)' },
  // Irish and Ga share the ISO 639-1 code 'ga', so they are disambiguated by
  // region subtag rather than left as a duplicate.
  { code: 'ga-IE', label: 'Irish' },

  // J
  { code: 'jam', label: 'Jamaican Patois' },
  { code: 'jv', label: 'Javanese' },
  { code: 'jpx', label: 'Jingpo' },

  // K
  { code: 'kl', label: 'Kalaallisut' },
  { code: 'kn', label: 'Kannada' },
  { code: 'kr', label: 'Kanuri' },
  { code: 'pam', label: 'Kapampangan' },
  { code: 'kk', label: 'Kazakh' },
  { code: 'kha', label: 'Khasi' },
  { code: 'km', label: 'Khmer' },
  { code: 'kig', label: 'Kiga' },
  { code: 'kg', label: 'Kikongo' },
  { code: 'rw', label: 'Kinyarwanda' },
  { code: 'ktb', label: 'Kituba' },
  { code: 'kbc', label: 'Kokborok' },
  { code: 'kv', label: 'Komi' },
  { code: 'kok', label: 'Konkani' },
  { code: 'kri', label: 'Krio' },
  { code: 'ku', label: 'Kurdish (Kurmanji)' },
  { code: 'ckb', label: 'Kurdish (Sorani)' },
  { code: 'ky', label: 'Kyrgyz' },

  // L
  { code: 'lo', label: 'Lao' },
  { code: 'ltg', label: 'Latgalian' },
  { code: 'la', label: 'Latin' },
  { code: 'lv', label: 'Latvian' },
  { code: 'lij', label: 'Ligurian' },
  { code: 'li', label: 'Limburgish' },
  { code: 'ln', label: 'Lingala' },
  { code: 'lt', label: 'Lithuanian' },
  { code: 'lom', label: 'Lombard' },
  { code: 'lg', label: 'Luganda' },
  { code: 'luo', label: 'Luo' },
  { code: 'lb', label: 'Luxembourgish' },

  // M
  { code: 'mk', label: 'Macedonian' },
  { code: 'mad', label: 'Madurese' },
  { code: 'mai', label: 'Maithili' },
  { code: 'mak', label: 'Makassar' },
  { code: 'mg', label: 'Malagasy' },
  { code: 'ms-Jawi', label: 'Malay (Jawi)' },
  { code: 'ml', label: 'Malayalam' },
  { code: 'mt', label: 'Maltese' },
  { code: 'mam', label: 'Mam' },
  { code: 'gv', label: 'Manx' },
  { code: 'mi', label: 'Maori' },
  { code: 'mr', label: 'Marathi' },
  { code: 'mh', label: 'Marshallese' },
  { code: 'mwr', label: 'Marwadi' },
  { code: 'mfe', label: 'Mauritian Creole' },
  { code: 'chm', label: 'Meadow Mari' },
  { code: 'mni', label: 'Meiteilon (Manipuri)' },
  { code: 'min', label: 'Minang' },
  { code: 'lus', label: 'Mizo' },
  { code: 'mn', label: 'Mongolian' },
  { code: 'my', label: 'Myanmar (Burmese)' },

  // N
  { code: 'nah', label: 'Nahuatl (Eastern Huasteca)' },
  { code: 'ndo', label: 'Ndau' },
  { code: 'nr', label: 'Ndebele (South)' },
  { code: 'new', label: 'Nepalbhasa (Newari)' },
  { code: 'ne', label: 'Nepali' },
  { code: 'nqo', label: 'NKo' },
  { code: 'nus', label: 'Nuer' },

  // O
  { code: 'oc', label: 'Occitan' },
  { code: 'or', label: 'Odia (Oriya)' },
  { code: 'om', label: 'Oromo' },
  { code: 'os', label: 'Ossetian' },

  // P
  { code: 'pag', label: 'Pangasinan' },
  { code: 'pap', label: 'Papiamento' },
  { code: 'ps', label: 'Pashto' },
  { code: 'pt-BR', label: 'Portuguese (Brazil)' },
  { code: 'pt-PT', label: 'Portuguese (Portugal)' },
  // Flemish. `nl` above is the standard Dutch entry; Flemish is the same
  // language as spoken in Belgium, which is a different register from
  // Netherlands Dutch, so it gets its own BCP-47 region subtag.
  { code: 'nl-BE', label: 'Dutch (Flemish)' },
  { code: 'pa', label: 'Punjabi (Gurmukhi)' },
  { code: 'pa-Arab', label: 'Punjabi (Shahmukhi)' },

  // Q
  { code: 'qu', label: 'Quechua' },
  { code: 'quc', label: 'Qʼeqchiʼ' },

  // R
  { code: 'rom', label: 'Romani' },
  { code: 'run', label: 'Rundi' },

  // S
  { code: 'se', label: 'Sami (North)' },
  { code: 'sm', label: 'Samoan' },
  { code: 'sg', label: 'Sango' },
  { code: 'sa', label: 'Sanskrit' },
  { code: 'sat', label: 'Santali (Ol Chiki)' },
  { code: 'sc', label: 'Santali (Latin)' },
  { code: 'gd', label: 'Scots Gaelic' },
  { code: 'nso', label: 'Sepedi' },
  { code: 'sr', label: 'Serbian' },
  { code: 'st', label: 'Sesotho' },
  { code: 'crs', label: 'Seychellois Creole' },
  { code: 'shn', label: 'Shan' },
  { code: 'sn', label: 'Shona' },
  { code: 'scn', label: 'Sicilian' },
  { code: 'szl', label: 'Silesian' },
  { code: 'sd', label: 'Sindhi' },
  { code: 'si', label: 'Sinhala' },
  { code: 'sk', label: 'Slovak' },
  { code: 'sl', label: 'Slovenian' },
  { code: 'so', label: 'Somali' },
  { code: 'su', label: 'Sundanese' },
  { code: 'sus', label: 'Susu' },
  { code: 'sw', label: 'Swahili' },
  { code: 'ss', label: 'Swati' },

  // T
  { code: 'ty', label: 'Tahitian' },
  { code: 'tg', label: 'Tajik' },
  { code: 'tzm', label: 'Tamazight' },
  { code: 'tzm-Tfng', label: 'Tamazight (Tifinagh)' },
  { code: 'ta', label: 'Tamil' },
  { code: 'tt', label: 'Tatar' },
  { code: 'te', label: 'Telugu' },
  { code: 'tet', label: 'Tetum' },
  { code: 'bo', label: 'Tibetan' },
  { code: 'ti', label: 'Tigrinya' },
  { code: 'tiv', label: 'Tiv' },
  { code: 'tpi', label: 'Tok Pisin' },
  { code: 'to', label: 'Tongan' },
  { code: 'lua', label: 'Tshiluba' },
  { code: 'ts', label: 'Tsonga' },
  { code: 'tn', label: 'Tswana' },
  { code: 'tcy', label: 'Tulu' },
  { code: 'tum', label: 'Tumbuka' },
  { code: 'tk', label: 'Turkmen' },
  { code: 'tyv', label: 'Tuvan' },
  { code: 'tw', label: 'Twi' },

  // U
  { code: 'udm', label: 'Udmurt' },
  { code: 'ug', label: 'Uyghur' },
  { code: 'uz', label: 'Uzbek' },

  // V
  { code: 've', label: 'Venda' },
  { code: 'vec', label: 'Venetian' },
  { code: 'war', label: 'Waray' },
  { code: 'cy', label: 'Welsh' },
  { code: 'wo', label: 'Wolof' },

  // X
  { code: 'xh', label: 'Xhosa' },

  // Y
  { code: 'sah', label: 'Yakut' },
  { code: 'yi', label: 'Yiddish' },
  { code: 'yo', label: 'Yoruba' },
  { code: 'yua', label: 'Yucatec Maya' },
  { code: 'zap', label: 'Zapotec' },

  // Z
  { code: 'zu', label: 'Zulu' },
];

/**
 * Codes whose ISO 639 assignment is uncertain (regional/minority languages
 * with no widely deployed 2-letter code). Kept in one place so the list can
 * be corrected or verified in a single edit.
 */
export const ORBIT_BEST_EFFORT_CODES = ['alur', 'krc', 'bbc', 'bbc2', 'bew', 'dje', 'kbc'] as const;

export function languageLabel(code: string): string {
  return ORBIT_LANGUAGES.find((l) => l.code === code)?.label ?? code;
}
