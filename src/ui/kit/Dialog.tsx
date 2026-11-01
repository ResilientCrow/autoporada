'use client';

import type { ReactNode } from 'react';
import { Dialog as AriaDialog, DialogTrigger } from 'react-aria-components/Dialog';
import { Heading } from 'react-aria-components/Heading';
import { Modal, ModalOverlay } from 'react-aria-components/Modal';

/**
 * A modal dialog opened by `trigger` (a kit `Button`): React Aria traps focus inside, closes on
 * Escape or a press outside, and gives focus back to the trigger. `title` is its heading and
 * names it. The open state belongs to the caller, so a form inside can close it when it settles.
 * Nothing renders until it opens, so the page's markup stays as it was (ADR 0047).
 */
export function Dialog({
  trigger,
  title,
  isOpen,
  onOpenChange,
  children,
}: {
  readonly trigger: ReactNode;
  readonly title: string;
  readonly isOpen: boolean;
  readonly onOpenChange: (isOpen: boolean) => void;
  readonly children: ReactNode;
}) {
  return (
    <DialogTrigger isOpen={isOpen} onOpenChange={onOpenChange}>
      {trigger}
      <ModalOverlay
        isDismissable
        className="fixed inset-0 z-50 flex items-center justify-center bg-navy-dark/60 p-4"
      >
        <Modal className="max-h-full w-full max-w-lg overflow-y-auto rounded-brand bg-light p-4 text-ink shadow-lg sm:p-6">
          <AriaDialog className="flex flex-col gap-4">
            <Heading slot="title" className="text-lg">
              {title}
            </Heading>
            {children}
          </AriaDialog>
        </Modal>
      </ModalOverlay>
    </DialogTrigger>
  );
}
