import { useRef, useState } from "react";
import IntlTelInput from "@intl-tel-input/react/with-utils";
import type { IntlTelInputRef } from "@intl-tel-input/react";
import { ru } from "intl-tel-input/locale";
import "intl-tel-input/styles";
import { Phone, ShieldCheck } from "lucide-react";

const typeNames: Record<string, string> = {
  MOBILE: "Мобильный",
  FIXED_LINE: "Стационарный",
  FIXED_LINE_OR_MOBILE: "Стационарный или мобильный",
  TOLL_FREE: "Бесплатная линия",
  PREMIUM_RATE: "Платная линия",
  VOIP: "IP-телефония",
  SHARED_COST: "Разделённая оплата",
  PERSONAL_NUMBER: "Персональный номер",
  PAGER: "Пейджер",
  UAN: "Универсальный номер",
  VOICEMAIL: "Голосовая почта",
};
export default function PhonePanel() {
  const phone = useRef<IntlTelInputRef>(null);
  const [report, setReport] = useState<{
    number: string;
    country: string;
    prefix: string;
    type: string;
  } | null>(null);
  const [error, setError] = useState("");
  function inspect() {
    const input = phone.current?.getInput();
    const instance = phone.current?.getInstance();
    if (!instance || !input?.value.trim()) {
      setError("Введите номер и выберите страну.");
      return;
    }
    if (!instance.isValidNumberPrecise()) {
      setReport(null);
      setError(
        "Номер не соответствует правилам выбранного плана нумерации. Проверьте страну, код и длину.",
      );
      return;
    }
    const country = instance.getSelectedCountry();
    if (!country) {
      setError("Выберите страну плана нумерации.");
      return;
    }
    setError("");
    setReport({
      number: instance.getNumber("E164"),
      country: country.name ?? country.iso2.toUpperCase(),
      prefix: `+${country.dialCode}`,
      type: typeNames[instance.getNumberType() ?? ""] ?? "Не определён",
    });
  }
  return (
    <div className="search-hub-panel">
      <h3>
        <Phone size={18} /> Проверка телефонного номера
      </h3>
      <p className="hub-note">
        Выберите страну и введите номер. Проверка выполняется локально по
        правилам нумерации.
      </p>
      <form
        className="hub-phone-form"
        onSubmit={(event) => {
          event.preventDefault();
          inspect();
        }}
      >
        <label htmlFor="public-phone">Номер телефона</label>
        <IntlTelInput
          ref={phone}
          initialCountry="kz"
          uiTranslations={ru}
          countryNameLocale="ru"
          countrySelectorMode="DROPDOWN"
          allowedNumberTypes={null}
          separateDialCode={false}
          numberDisplayFormat="INTERNATIONAL"
          inputProps={{
            id: "public-phone",
            autoComplete: "off",
            maxLength: 40,
            "aria-describedby": "phone-privacy",
          }}
          onChangeNumber={() => {
            setReport(null);
            setError("");
          }}
          onChangeCountry={() => {
            setReport(null);
            setError("");
          }}
        />
        <button className="primary-button" type="submit">
          Проверить номер <ShieldCheck size={16} />
        </button>
      </form>
      {error ? (
        <p className="hub-error" role="alert">
          {error}
        </p>
      ) : null}
      {report ? (
        <div className="hub-report" role="status">
          <div className="hub-report-title">
            <ShieldCheck size={17} /> Формат соответствует правилам
          </div>
          <dl>
            <div>
              <dt>Международный формат</dt>
              <dd>{report.number}</dd>
            </div>
            <div>
              <dt>План нумерации</dt>
              <dd>{report.country}</dd>
            </div>
            <div>
              <dt>Телефонный код</dt>
              <dd>{report.prefix}</dd>
            </div>
            <div>
              <dt>Тип по справочнику</dt>
              <dd>{report.type}</dd>
            </div>
          </dl>
          <p>
            Это не подтверждает существование номера или активность SIM-карты.
          </p>
        </div>
      ) : null}
      <div className="hub-privacy" id="phone-privacy">
        <ShieldCheck size={16} />
        <span>
          Номер не отправляется на сервер и не сохраняется. Страна плана
          нумерации не означает местонахождение владельца. Код +7 используется
          несколькими странами; оператор может меняться при переносе номера.
        </span>
      </div>
      <p className="hub-source">
        Форматирование и проверка:{" "}
        <a
          href="https://github.com/jackocnr/intl-tel-input"
          target="_blank"
          rel="noreferrer"
        >
          intl-tel-input
        </a>
        . Поиск владельца и данных из утечек не подключён.
      </p>
    </div>
  );
}
