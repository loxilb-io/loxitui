// Command loxitui is the LoxiLB terminal user interface.
package main

import (
	"fmt"
	"os"

	"github.com/loxilb-io/loxitui/internal/version"
)

func main() {
	if len(os.Args) > 1 && (os.Args[1] == "--version" || os.Args[1] == "-version") {
		fmt.Println("loxitui", version.Version)
		return
	}
	fmt.Println("loxitui: not yet implemented")
}
