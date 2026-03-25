import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useI18n } from "@/i18n"
import { useAppRuntimeStore } from "@/stores/app"
import { Coins } from "lucide-react"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function InsufficientCreditsDialog({ open, onOpenChange }: Props) {
  const { t } = useI18n()
  const { openPayPage, creditBalance } = useAppRuntimeStore()

  const handleTopUp = async () => {
    onOpenChange(false)
    await openPayPage()
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Coins size={20} className="text-amber-500" />
            {t.insufficientCredits.title}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <p>{t.insufficientCredits.description}</p>
            {creditBalance != null && (
              <p className="text-sm">
                {t.insufficientCredits.currentBalance}{creditBalance.toLocaleString()}
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction onClick={handleTopUp}>
            {t.insufficientCredits.topUp}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
