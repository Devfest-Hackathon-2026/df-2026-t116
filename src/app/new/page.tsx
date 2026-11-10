import { NewThemeForm } from "@/components/NewThemeForm";

export const metadata = { title: "作品を始める | つづきコマ" };

export default function NewThemePage() {
  return (
    <>
      <h1 className="page-title">作品を始める</h1>
      <p className="small muted">作品名・物語の軸・絵柄・キャラを決めると、みんなが1ページずつ続きを描きます。</p>
      <NewThemeForm />
    </>
  );
}
