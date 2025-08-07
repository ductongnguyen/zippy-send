import { Footer } from "antd/es/layout/layout";

export default function PageFooter() {
    return (
        <Footer style={{ textAlign: 'center'}}>
            © {new Date().getFullYear()} Zippy Send. All rights reserved.
        </Footer>
    )
}