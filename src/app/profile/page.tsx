// src/app/profile/page.tsx
import { redirect } from "next/navigation";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { Card } from "~/components/ui/card";
import ProfileForm from "./ProfileForm";
import EmailSection from "./email/EmailSection";

export const metadata = { title: "Личный кабинет" };
//tt
export default async function ProfilePage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/auth/signin?callbackUrl=/profile");

  const [user, _sessions] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        email: true,
        phone: true,
        defaultCity: true,
        organization: true,
      },
    }),
    db.session.count({ where: { userId: session.user.id } }), // оставил на будущее
  ]);

  return (
    <div className="mx-auto mt-8 max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold text-sky-700">Личный кабинет</h1>

      <Card className="p-6">
        <div className="mb-6 text-sm text-slate-600">
          Почта (логин): <b>{user?.email ?? "—"}</b>
        </div>

        {/* Основные поля профиля */}
        <ProfileForm
          initial={{
            name: user?.name ?? "",
            phone: user?.phone ?? "",
            defaultCity: user?.defaultCity ?? "",
            organization: user?.organization ?? "",
          }}
        />
      </Card>

      {/* Отдельная секция смены email */}
      <EmailSection currentEmail={user?.email ?? ""} />
    </div>
  );
}
