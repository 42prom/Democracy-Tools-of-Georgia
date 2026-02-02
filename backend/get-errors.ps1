$ErrorActionPreference = "Continue"
npx tsc --noEmit 2&gt;&1 | Out-File -FilePath "ts-errors.txt" -Encoding utf8
Get-Content "ts-errors.txt"
