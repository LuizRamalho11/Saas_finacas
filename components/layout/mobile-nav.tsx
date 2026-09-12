"use client";

import * as React from "react";
import Link from "next/link";
import { Menu } from "lucide-react";
import { Logo } from "./logo";
import { NavLinks } from "./nav-links";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

/** Drawer de navegação para telas pequenas. */
export function MobileNav() {
  const [open, setOpen] = React.useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu de navegação">
          <Menu aria-hidden />
        </Button>
      </SheetTrigger>
      <SheetContent className="p-4">
        <SheetTitle className="sr-only">Navegação principal</SheetTitle>
        <Link href="/dashboard" className="mb-6 block rounded-lg" onClick={() => setOpen(false)}>
          <Logo />
        </Link>
        <NavLinks onNavigate={() => setOpen(false)} />
      </SheetContent>
    </Sheet>
  );
}
