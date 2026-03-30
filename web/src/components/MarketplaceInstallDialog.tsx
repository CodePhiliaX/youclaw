import { openExternal } from '../api/transport'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '../components/ui/alert-dialog'
import { useI18n } from '../i18n'
import type { MarketplaceInstallDialogViewModel } from '../lib/marketplace-view-model'
import { AlertTriangle, ExternalLink, ShieldAlert, User } from 'lucide-react'

export function MarketplaceInstallDialog({
  open,
  viewModel,
  confirmLabel,
  onOpenChange,
  onConfirm,
}: {
  open: boolean
  viewModel: MarketplaceInstallDialogViewModel | null
  confirmLabel?: string
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useI18n()
  const externalUrl = viewModel?.externalUrl ?? null

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.skills.confirmInstallTitle}</AlertDialogTitle>
          <AlertDialogDescription>{t.skills.confirmInstallDesc}</AlertDialogDescription>
        </AlertDialogHeader>
        {viewModel && (
          <div className="space-y-3 text-sm">
            {externalUrl ? (
              <button
                type="button"
                onClick={() => void openExternal(externalUrl)}
                className="flex items-center gap-2 font-medium hover:text-primary"
              >
                <span>{viewModel.displayName}</span>
                <ExternalLink className="h-3.5 w-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-2 font-medium">
                {viewModel.displayName}
              </div>
            )}
            <div className="text-xs text-muted-foreground">{viewModel.summary}</div>

            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {viewModel.stats.map((stat) => (
                <span key={stat.key}>{stat.label}: {stat.value}</span>
              ))}
            </div>

            {viewModel.authorName && (
              <div className="flex items-center gap-2 text-xs">
                {viewModel.authorImage ? (
                  <img src={viewModel.authorImage} alt="" className="w-5 h-5 rounded-full" />
                ) : (
                  <User className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="text-muted-foreground">{t.skills.skillAuthor}:</span>
                <span>{viewModel.authorName}</span>
              </div>
            )}

            {viewModel.isSuspicious && (
              <div className="flex items-center gap-2 rounded-md border border-yellow-500/30 bg-yellow-500/10 p-2 text-xs text-yellow-500">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{t.skills.skillSuspicious}</span>
              </div>
            )}

            {viewModel.isMalwareBlocked && (
              <div className="flex items-center gap-2 rounded-md border border-red-500/30 bg-red-500/10 p-2 text-xs text-red-500">
                <ShieldAlert className="h-4 w-4 shrink-0" />
                <span>{t.skills.skillBlocked}</span>
              </div>
            )}
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>{t.common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={viewModel?.isMalwareBlocked}
          >
            {confirmLabel || t.skills.confirmInstall}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
