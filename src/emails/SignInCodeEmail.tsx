import * as React from "react";
import { Body, Container, Head, Html, Preview, Section, Text } from "@react-email/components";

export default function SignInCodeEmail({ code }: { code: string }) {
  const spaced = code.split("").join(" ");

  return (
    <Html>
      <Head />
      <Preview>Код для входа на Яесть</Preview>
      <Body style={{ backgroundColor: "#f7fbff", fontFamily: "Arial, sans-serif" }}>
        <Container
          style={{
            maxWidth: 520,
            margin: "32px auto",
            backgroundColor: "#ffffff",
            borderRadius: 12,
            boxShadow: "0 6px 30px rgba(0,0,0,0.06)",
          }}
        >
          <Section style={{ padding: "28px 32px 16px" }}>
            <Text style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#0ea5e9" }}>Я Есть</Text>
            <Text style={{ margin: "18px 0 0", fontSize: 18, fontWeight: 700 }}>Ваш код для входа</Text>
            <Text style={{ margin: "12px 0 0", color: "#475569", lineHeight: 1.5 }}>
              Введите этот код на сайте, чтобы подтвердить почту. Он будет активен в течение 10 минут.
            </Text>
            <Section
              style={{
                marginTop: 24,
                padding: "18px 16px",
                borderRadius: 10,
                background: "#eef6ff",
                textAlign: "center",
                letterSpacing: "0.3em",
                fontSize: 32,
                fontWeight: 800,
                color: "#0f172a",
              }}
            >
              {spaced}
            </Section>
            <Text style={{ marginTop: 20, fontSize: 12, color: "#64748b" }}>
              Если вы не запрашивали код, просто проигнорируйте это письмо.
            </Text>
          </Section>
        </Container>
        <Text style={{ textAlign: "center", fontSize: 12, color: "#94a3b8" }}>
          © {new Date().getFullYear()} Я Есть. Все права защищены.
        </Text>
      </Body>
    </Html>
  );
}
