// src/app/HomeForm.tsx
"use client";

import { useForm } from "react-hook-form";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import { createOrder, type CreateOrderResult } from "./actions/createOrder";
import CityCombo from "~/components/CityCombo";

type PersonType = "individual" | "company";

type FormData = {
  personType: PersonType;
  fio: string;
  phone?: string;
  email?: string;
  city: string;
  date: string; // YYYY-MM-DD
  details: string;
  organization?: string;
};

function toLocalISO(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function HomeForm({
  defaultEmail,
  defaultPhone,
  defaultName,
  defaultCity,
  defaultOrganization,
  defaultPersonType = "individual",
}: {
  defaultEmail?: string;
  defaultPhone?: string;
  defaultName?: string;
  defaultCity?: string;
  defaultOrganization?: string;
  defaultPersonType?: PersonType;
}) {
  const STORAGE_KEY = "homeFormDraft";
  const defaultValues = useMemo<FormData>(
    () => ({
      email: defaultEmail ?? "",
      phone: defaultPhone ?? "",
      fio: defaultName ?? "",
      city: defaultCity ?? "",
      organization: defaultOrganization ?? "",
      personType: defaultOrganization ? "company" : defaultPersonType,
      date: "",
      details: "",
    }),
    [defaultEmail, defaultPhone, defaultName, defaultCity, defaultOrganization, defaultPersonType],
  );

  const {
    register,
    handleSubmit,
    reset,
    watch,
    control,
    formState: { errors },
  } = useForm<FormData>({
    defaultValues,
  });

  const isCompany = watch("personType") === "company";

  // --- Минимально допустимая дата: СЕГОДНЯ (запретить прошлые даты) ---
  const { minDateISO, minDateObjRu } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // локальная полуночь
    const iso = toLocalISO(today); // YYYY-MM-DD
    const ru = today.toLocaleDateString("ru-RU"); // 14.10.2025
    return { minDateISO: iso, minDateObjRu: ru };
  }, []);

  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<FormData>;
      reset({ ...defaultValues, ...parsed });
    } catch (err) {
      console.warn("[homeForm] failed to restore draft", err);
    }
  }, [reset, defaultValues]);

  useEffect(() => {
    const subscription = watch((values) => {
      if (typeof window === "undefined" || !values) return;
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(values));
      } catch (err) {
        console.warn("[homeForm] failed to stash draft", err);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch]);

  // ⚠️ createOrder может сделать redirect("/thanks") и вернуть void.
  type CreateOrderResultOrVoid = CreateOrderResult | void;

  const onSubmit = async (data: FormData) => {
    setLoading(true);
    try {
      const res: CreateOrderResultOrVoid = await createOrder({
        city: data.city,
        details: data.details,
        date: data.date,
      });

      // Если server action сделал redirect — код ниже не исполнится в браузере,
      // но на всякий случай защищаемся:
      if (!res) return;

      if (!res.ok) {
        if (res.error === "NOT_AUTHENTICATED") {
          router.push("/auth/signin?callbackUrl=/");
          return;
        }
        // Можно добавить показ ошибок в UI при желании
        return;
      }

      // Успех: чистим форму
      reset({
        personType: defaultPersonType,
        fio: defaultName ?? "",
        email: defaultEmail ?? "",
        phone: defaultPhone ?? "",
        city: defaultCity ?? "",
        organization: defaultOrganization ?? "",
        date: "",
        details: "",
      });
      if (typeof window !== "undefined") {
        window.localStorage.removeItem(STORAGE_KEY);
      }

      // Если экшен НЕ редиректил сам — отправим на /thanks здесь.
      router.push("/thanks");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="p-6">
      <form
        className="grid grid-cols-1 gap-4 md:grid-cols-2"
        onSubmit={handleSubmit(onSubmit)}
      >
        {/* переключатель ФЛ/ЮЛ */}
        <div className="flex gap-6 text-sm md:col-span-2">
          <label className="flex items-center gap-2">
            <input type="radio" value="individual" {...register("personType")} />
            Для физических лиц
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="company" {...register("personType")} />
            Для юридических лиц
          </label>
        </div>

        {/* ФИО */}
        <div>
          <Label className="mb-1 block">
            ФИО <span className="text-rose-500">*</span>
          </Label>
          <Input
            {...register("fio", {
              required: "Укажите ФИО",
              minLength: { value: 2, message: "Минимум 2 символа" },
              maxLength: { value: 120, message: "Слишком длинно" },
            })}
            placeholder="Иванов Иван"
          />
          {errors.fio && (
            <p className="mt-1 text-xs text-rose-600">{errors.fio.message}</p>
          )}
        </div>

        {/* Email */}
        <div>
          <Label className="mb-1 block">
            Электронная почта <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="email"
            {...register("email", {
              required: "Укажите e-mail",
              pattern: {
                value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                message: "Похоже, e-mail указан некорректно",
              },
            })}
            placeholder="you@mail.ru"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-rose-600">{errors.email.message}</p>
          )}
        </div>

        {/* Телефон */}
        <div>
          <Label className="mb-1 block">
            Номер телефона <span className="text-rose-500">*</span>
          </Label>
          <Input
            {...register("phone", {
              required: "Укажите номер",
              validate: (v) => {
                const digits = (v ?? "").replace(/\D/g, "");
                return digits.length >= 10 || "Некорректный номер";
              },
            })}
            placeholder="+7 999 123-45-67"
          />
          {errors.phone && (
            <p className="mt-1 text-xs text-rose-600">{errors.phone.message}</p>
          )}
        </div>

        {/* Город — автокомплит */}
        <div>
          <Label className="mb-1 block">
            Город <span className="text-rose-500">*</span>
          </Label>
          <CityCombo control={control} name="city" placeholder="Москва" />
        </div>

        {/* Дата исполнения — минимум СЕГОДНЯ */}
        <div>
          <Label className="mb-1 block">
            Дата исполнения <span className="text-rose-500">*</span>
          </Label>
          <Input
            type="date"
            min={minDateISO}
            {...register("date", {
              required: "Укажите дату",
              validate: (v) => {
                // сравниваем по локальному времени на полуночь
                const sel = new Date(v + "T00:00:00");
                sel.setHours(0, 0, 0, 0);
                const min = new Date(minDateISO + "T00:00:00");
                min.setHours(0, 0, 0, 0);
                return sel >= min || `Дата не ранее ${minDateObjRu}`;
              },
            })}
          />
          {errors.date && (
            <p className="mt-1 text-xs text-rose-600">{errors.date.message}</p>
          )}
          <p className="mt-1 text-[11px] text-slate-500">
            Можно выбрать начиная с {minDateObjRu}.
          </p>
        </div>

        {/* Организация — только для юр. лиц */}
        {isCompany && (
          <div className="md:col-span-2">
            <Label className="mb-1 block">
              Организация <span className="text-rose-500">*</span>
            </Label>
            <Input
              {...register("organization", {
                required: "Укажите название организации",
                minLength: { value: 2, message: "Минимум 2 символа" },
                maxLength: { value: 200, message: "Слишком длинно" },
              })}
              placeholder="ООО «Пример»"
            />
            {errors.organization && (
              <p className="mt-1 text-xs text-rose-600">
                {errors.organization.message}
              </p>
            )}
          </div>
        )}

        {/* Задача */}
        <div className="md:col-span-2">
          <Label className="mb-1 block">
            Задача / подробности <span className="text-rose-500">*</span>
          </Label>
          <Textarea
            rows={5}
            {...register("details", { required: "Опишите задачу" })}
            placeholder="Что нужно сделать исполнителю?"
          />
          {errors.details && (
            <p className="mt-1 text-xs text-rose-600">
              {errors.details.message}
            </p>
          )}
        </div>

        <div className="md:col-span-2">
          <Button
            type="submit"
            className="bg-orange-500 hover:bg-orange-600"
            disabled={loading}
          >
            {loading ? "Отправляем..." : "Создать заказ"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
