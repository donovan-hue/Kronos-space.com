import { expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Avatar } from "../src/components/ui/avatar";
import { Badge } from "../src/components/ui/badge";
import { Button } from "../src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../src/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../src/components/ui/dialog";
import { Input } from "../src/components/ui/input";
import { Label } from "../src/components/ui/label";
import { Skeleton } from "../src/components/ui/skeleton";
import { Textarea } from "../src/components/ui/textarea";
import ReportDialog from "../src/features/moderation/ReportDialog";
import * as moderation from "../src/services/moderationService";

vi.mock("../src/services/moderationService", () => ({
  createReport: vi.fn(),
  REPORT_REASONS: [
    { value: "spam", label: "Spam" },
    { value: "other", label: "Otro" },
  ],
}));

test("kit: Button renderiza el material cromado y bloquea clics deshabilitado", () => {
  const onClick = vi.fn();
  const { rerender } = render(<Button onClick={onClick}>Guardar</Button>);
  const button = screen.getByRole("button", { name: "Guardar" });
  expect(button.className).toContain("bg-k-chrome-btn");
  expect(button.className).toContain("rounded-full");
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(
    <Button onClick={onClick} disabled>
      Guardar
    </Button>
  );
  fireEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("kit: Button asChild envuelve un enlace conservando el estilo", () => {
  render(
    <MemoryRouter>
      <Button asChild variant="ghost">
        <a href="/post/1">Ver publicación</a>
      </Button>
    </MemoryRouter>
  );
  const link = screen.getByRole("link", { name: "Ver publicación" });
  expect(link.className).toContain("rounded-full");
});

test("kit: Input, Textarea y Label se conectan vía htmlFor", () => {
  render(
    <>
      <Label htmlFor="kit-correo">Correo</Label>
      <Input id="kit-correo" placeholder="tu@correo.com" />
      <Label htmlFor="kit-detalles">Detalles</Label>
      <Textarea id="kit-detalles" />
    </>
  );
  const input = screen.getByLabelText("Correo");
  expect(input.tagName).toBe("INPUT");
  fireEvent.change(input, { target: { value: "a@b.c" } });
  expect(input.value).toBe("a@b.c");
  expect(screen.getByPlaceholderText("tu@correo.com")).toBeTruthy();
  expect(screen.getByLabelText("Detalles").tagName).toBe("TEXTAREA");
});

test("kit: Card, Badge y Skeleton exponen estructura y estado", () => {
  render(
    <Card>
      <CardHeader>
        <CardTitle>Sesión de video</CardTitle>
        <Badge variant="secondary">En proceso</Badge>
      </CardHeader>
      <CardContent>
        <Skeleton className="h-[18px] w-40" />
      </CardContent>
    </Card>
  );
  expect(screen.getByRole("heading", { name: "Sesión de video" })).toBeTruthy();
  expect(screen.getByText("En proceso")).toBeTruthy();
  const skeleton = document.querySelector('[data-slot="skeleton"]');
  expect(skeleton.className).toContain("animate-k-pulse");
});

test("kit: Avatar muestra la inicial y degrada a fallback si la imagen falla", () => {
  const { rerender } = render(<Avatar alt="Luna" />);
  expect(screen.getByText("L")).toBeTruthy();

  rerender(<Avatar src="/roto.jpg" alt="Luna" fallback="L" />);
  const image = screen.getByRole("img", { name: "Luna" });
  fireEvent.error(image);
  expect(screen.getByText("L")).toBeTruthy();
});

test("kit: Dialog abre con trigger, cierra con X y responde a Escape", async () => {
  render(
    <Dialog>
      <DialogTrigger asChild>
        <Button>Abrir panel</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Panel KRONOS</DialogTitle>
          <DialogDescription>Descripción accesible del panel.</DialogDescription>
        </DialogHeader>
      </DialogContent>
    </Dialog>
  );

  fireEvent.click(screen.getByRole("button", { name: "Abrir panel" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();

  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  fireEvent.click(screen.getByRole("button", { name: "Abrir panel" }));
  expect(await screen.findByRole("dialog")).toBeTruthy();
  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
});

test("kit: ReportDialog accesible — Escape cierra y el envío usa el servicio", async () => {
  moderation.createReport.mockResolvedValue({ _id: "r-1" });

  const onClose = vi.fn();
  const onReported = vi.fn();
  render(
    <ReportDialog
      open
      targetType="comment"
      targetId="c-1"
      targetLabel="un comentario"
      onClose={onClose}
      onReported={onReported}
    />
  );

  expect(screen.getByRole("dialog")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Detalles (opcional)"), {
    target: { value: "Es spam repetido" },
  });
  fireEvent.click(screen.getByRole("button", { name: "Enviar reporte" }));

  await waitFor(() =>
    expect(moderation.createReport).toHaveBeenCalledWith({
      targetType: "comment",
      targetId: "c-1",
      reason: "spam",
      details: "Es spam repetido",
    })
  );
  await waitFor(() => expect(onReported).toHaveBeenCalledWith({ _id: "r-1" }));

  fireEvent.keyDown(document, { key: "Escape" });
  await waitFor(() => expect(onClose).toHaveBeenCalled());
});
