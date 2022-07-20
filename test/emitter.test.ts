import * as emitter from "../src/emitter"

describe("emitter.Emitter.emit", () => {
    let inst3: any
    let inst: any
    let inst2: any

    beforeEach(() => {
        inst3 = new emitter.Emitter()
        inst = new emitter.Emitter()
        inst2 = new emitter.Emitter()
    })

    test("0", () => {
        let result: any = inst2.emit("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20version%3D%221.1%22%20baseProfile%3D%22full%22%20width%3D%22undefined%22%20height%3D%22undefined%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22grey%22%2F%3E%3Ctext%20x%3D%22NaN%22%20y%3D%22NaN%22%20font-size%3D%2220%22%20alignment-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%3Eundefinedxundefined%3C%2Ftext%3E%3C%2Fsvg%3E", undefined, true)
        expect(result).toMatchSnapshot()
    })

    test("1", () => {
        let result: any = inst.emit("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20version%3D%221.1%22%20baseProfile%3D%22full%22%20width%3D%22undefined%22%20height%3D%22undefined%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22grey%22%2F%3E%3Ctext%20x%3D%22NaN%22%20y%3D%22NaN%22%20font-size%3D%2220%22%20alignment-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%3Eundefinedxundefined%3C%2Ftext%3E%3C%2Fsvg%3E", undefined, false)
        expect(result).toMatchSnapshot()
    })

    test("2", () => {
        let result: any = inst3.emit("", undefined, false)
        expect(result).toMatchSnapshot()
    })
})

describe("emitter.Emitter.off", () => {
    let inst4: any
    let inst3: any
    let inst: any
    let inst2: any

    beforeEach(() => {
        inst4 = new emitter.Emitter()
        inst3 = new emitter.Emitter()
        inst = new emitter.Emitter()
        inst2 = new emitter.Emitter()
    })

    test("0", () => {
        let result: any = inst2.off("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20version%3D%221.1%22%20baseProfile%3D%22full%22%20width%3D%22undefined%22%20height%3D%22undefined%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22grey%22%2F%3E%3Ctext%20x%3D%22NaN%22%20y%3D%22NaN%22%20font-size%3D%2220%22%20alignment-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%3Eundefinedxundefined%3C%2Ftext%3E%3C%2Fsvg%3E", false)
        expect(result).toMatchSnapshot()
    })

    test("1", () => {
        let result: any = inst.off("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20version%3D%221.1%22%20baseProfile%3D%22full%22%20width%3D%22undefined%22%20height%3D%22undefined%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22grey%22%2F%3E%3Ctext%20x%3D%22NaN%22%20y%3D%22NaN%22%20font-size%3D%2220%22%20alignment-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%3Eundefinedxundefined%3C%2Ftext%3E%3C%2Fsvg%3E", true)
        expect(result).toMatchSnapshot()
    })

    test("2", () => {
        let result: any = inst3.off("", false)
        expect(result).toMatchSnapshot()
    })
})

describe("emitter.Emitter.on", () => {
    let inst: any
    let inst2: any

    beforeEach(() => {
        inst = new emitter.Emitter()
        inst2 = new emitter.Emitter()
    })

    test("0", () => {
        let result: any = inst2.on("data:image/svg+xml;charset=UTF-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20version%3D%221.1%22%20baseProfile%3D%22full%22%20width%3D%22undefined%22%20height%3D%22undefined%22%3E%3Crect%20width%3D%22100%25%22%20height%3D%22100%25%22%20fill%3D%22grey%22%2F%3E%3Ctext%20x%3D%22NaN%22%20y%3D%22NaN%22%20font-size%3D%2220%22%20alignment-baseline%3D%22middle%22%20text-anchor%3D%22middle%22%20fill%3D%22white%22%3Eundefinedxundefined%3C%2Ftext%3E%3C%2Fsvg%3E", () => undefined)
        expect(result).toMatchSnapshot()
    })

    test("1", () => {
        let result: any = inst.on("", () => undefined)
        expect(result).toMatchSnapshot()
    })
})

describe("emitter.Emitter.event", () => {
    let inst5: any
    let inst4: any
    let inst3: any
    let inst: any
    let inst2: any

    beforeEach(() => {
        inst5 = new emitter.Emitter()
        inst4 = new emitter.Emitter()
        inst3 = new emitter.Emitter()
        inst = new emitter.Emitter()
        inst2 = new emitter.Emitter()
    })

    test("0", () => {
        let result: any = inst2.event("SELECT * FROM Movies WHERE Title=’Jurassic Park’ AND Director='Steven Spielberg';")
        expect(result).toMatchSnapshot()
    })

    test("1", () => {
        let result: any = inst.event("UPDATE Projects SET pname = %s WHERE pid = %s")
        expect(result).toMatchSnapshot()
    })

    test("2", () => {
        let result: any = inst3.event("DROP TABLE tmp;")
        expect(result).toMatchSnapshot()
    })

    test("3", () => {
        let result: any = inst4.event("UNLOCK TABLES;")
        expect(result).toMatchSnapshot()
    })

    test("4", () => {
        let result: any = inst5.event("")
        expect(result).toMatchSnapshot()
    })
})

describe("emitter.Emitter.size", () => {
    let inst2: any

    beforeEach(() => {
        inst2 = new emitter.Emitter()
    })

    test("0", () => {
        let result: any = inst2.size()
        expect(result).toMatchSnapshot()
    })
})
