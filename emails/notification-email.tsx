import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";

/**
 * The one transactional template — spec 15.1.
 *
 * Every notification uses this shell because 15.3 constrains what an email may
 * contain far more than how it looks: no rates, no worker names, and no counterparty
 * company names before the related engagement is Confirmed. The email states the
 * event and deep-links into the app, where the projections in 17.1 decide what the
 * reader is allowed to see. One template makes that rule easy to audit and hard to
 * violate by accident in a new message.
 */
export type NotificationEmailProps = {
  heading: string;
  body: string;
  actionLabel?: string;
  actionUrl?: string;
};

export function NotificationEmail({
  heading,
  body,
  actionLabel,
  actionUrl,
}: NotificationEmailProps) {
  return (
    <Html lang="en-AU">
      <Head />
      <Preview>{heading}</Preview>
      {/* Hi-Vis Standard: dark ground, one earned amber accent (DESIGN.md). Inline
          styles because email clients ignore stylesheets and CSS custom properties. */}
      <Body style={{ backgroundColor: "#101820", margin: 0, padding: "24px 0" }}>
        <Container
          style={{
            backgroundColor: "#0C1319",
            border: "1px solid rgba(255,255,255,0.10)",
            borderRadius: "16px",
            margin: "0 auto",
            maxWidth: "560px",
            padding: "32px",
          }}
        >
          <Text
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "11px",
              fontWeight: 600,
              letterSpacing: "0.08em",
              margin: "0 0 12px",
              textTransform: "uppercase",
            }}
          >
            Maintain Workforce
          </Text>

          <Heading
            as="h1"
            style={{
              color: "#FFFFFF",
              fontSize: "22px",
              fontWeight: 800,
              lineHeight: 1.25,
              margin: "0 0 16px",
            }}
          >
            {heading}
          </Heading>

          <Text
            style={{
              color: "rgba(255,255,255,0.72)",
              fontSize: "15px",
              lineHeight: 1.6,
              margin: "0 0 24px",
            }}
          >
            {body}
          </Text>

          {actionUrl && (
            <Section>
              <Link
                href={actionUrl}
                style={{
                  backgroundColor: "#FFC400",
                  borderRadius: "999px",
                  color: "#07272D",
                  display: "inline-block",
                  fontSize: "15px",
                  fontWeight: 700,
                  padding: "12px 28px",
                  textDecoration: "none",
                }}
              >
                {actionLabel ?? "Open in Maintain Workforce"}
              </Link>
            </Section>
          )}

          <Text
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: "13px",
              lineHeight: 1.6,
              margin: "28px 0 0",
            }}
          >
            Details stay in the app so each business sees only what it should.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export default NotificationEmail;
