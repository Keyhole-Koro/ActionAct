import { useState, useEffect } from "react";
import {
    getResponseLanguagePreference,
    subscribeResponseLanguagePreference,
    type ResponseLanguage,
} from "@/lib/response-language-preference";

export function useLanguage(): ResponseLanguage {
    const [lang, setLang] = useState<ResponseLanguage>("ja");
    useEffect(() => {
        setLang(getResponseLanguagePreference());
        return subscribeResponseLanguagePreference(setLang);
    }, []);
    return lang;
}
